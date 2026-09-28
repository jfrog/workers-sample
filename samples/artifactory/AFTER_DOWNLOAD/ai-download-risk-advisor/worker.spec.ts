import { PlatformContext, PlatformClients, PlatformHttpClient, PlatformSecrets, PlatformProperties } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AfterDownloadRequest } from './types';
import runWorker from './worker';

const PING_OK = { status: 200, data: { status: 'pong' } };

function buildRequest(): DeepMocked<AfterDownloadRequest> {
    return createMock<AfterDownloadRequest>({
        metadata: {
            repoPath: { key: 'example-repo-local', path: 'com/acme/payments-2.3.0.jar' }
        } as any,
        userContext: { id: 'alice', isToken: false } as any
    });
}

function buildContext(): DeepMocked<PlatformContext> {
    return createMock<PlatformContext>({
        clients: createMock<PlatformClients>({
            platformHttp: createMock<PlatformHttpClient>({
                get: jest.fn().mockResolvedValue(PING_OK)
            }),
            axios: createMock<any>({
                post: jest.fn().mockResolvedValue({ status: 200, data: {} })
            })
        }),
        secrets: createMock<PlatformSecrets>({
            get: jest.fn().mockReturnValue(undefined)
        }),
        properties: createMock<PlatformProperties>({
            get: jest.fn().mockReturnValue(undefined)
        })
    });
}

describe('ai-download-risk-advisor tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;

    beforeEach(() => {
        context = buildContext();
        request = buildRequest();
    });

    it('stops when Xray is not available', async () => {
        context.clients.platformHttp.get = jest.fn().mockRejectedValue(new Error('unreachable'));

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'Could not check for Xray scans because Xray is not available.'
        });
    });

    it('stops when no matching Xray scan result is found', async () => {
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) => {
            if (endpoint.includes('/system/ping')) return Promise.resolve(PING_OK);
            return Promise.resolve({ status: 200, data: { data: [], offset: 0 } });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'Could not find an Xray scan result matching this artifact.'
        });
    });

    it('falls back to property defaults when context.properties.get throws', async () => {
        context.properties.get = jest.fn().mockImplementation(() => {
            throw new Error('unknown property key');
        });
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) => {
            if (endpoint.includes('/system/ping')) return Promise.resolve(PING_OK);
            return Promise.resolve({
                status: 200,
                data: {
                    data: [{
                        name: 'payments-2.3.0.jar',
                        repo_full_path: 'example-repo-local/com/acme/payments-2.3.0.jar',
                        sec_issues: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
                        violations: 0
                    }],
                    offset: 0
                }
            });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'No security issues or violations found for this artifact; skipped AI risk advisory.'
        });
    });

    it('skips the AI call for a clean artifact', async () => {
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) => {
            if (endpoint.includes('/system/ping')) return Promise.resolve(PING_OK);
            return Promise.resolve({
                status: 200,
                data: {
                    data: [{
                        name: 'payments-2.3.0.jar',
                        repo_full_path: 'example-repo-local/com/acme/payments-2.3.0.jar',
                        sec_issues: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
                        violations: 0
                    }],
                    offset: 0
                }
            });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'No security issues or violations found for this artifact; skipped AI risk advisory.'
        });
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('asks Claude for a summary and posts it to Slack when issues are found', async () => {
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) => {
            if (endpoint.includes('/system/ping')) return Promise.resolve(PING_OK);
            return Promise.resolve({
                status: 200,
                data: {
                    data: [{
                        name: 'payments-2.3.0.jar',
                        repo_full_path: 'example-repo-local/com/acme/payments-2.3.0.jar',
                        sec_issues: { critical: 2, high: 1, medium: 0, low: 0, total: 3 },
                        violations: 1
                    }],
                    offset: 0
                }
            });
        });
        context.secrets.get = jest.fn().mockImplementation((key: string) => {
            if (key === 'AnthropicApiKey') return 'sk-ant-test';
            if (key === 'Slack_URL') return 'https://hooks.slack.test/services/xyz';
            return undefined;
        });
        context.clients.axios.post = jest.fn().mockImplementation((url: string) => {
            if (url === 'https://api.anthropic.com/v1/messages') {
                return Promise.resolve({ status: 200, data: { content: [{ type: 'text', text: 'Hold off on deploying this version.' }] } });
            }
            return Promise.resolve({ status: 200, data: {} });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'AI risk summary generated and posted to Slack.'
        });
        expect(context.clients.axios.post).toHaveBeenCalledWith(
            'https://api.anthropic.com/v1/messages',
            expect.objectContaining({ model: expect.any(String) }),
            expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }) })
        );
        expect(context.clients.axios.post).toHaveBeenCalledWith(
            'https://hooks.slack.test/services/xyz',
            expect.objectContaining({ text: expect.stringContaining('Hold off on deploying this version.') })
        );
    });

    it('falls back to raw stats when AnthropicApiKey is not configured', async () => {
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) => {
            if (endpoint.includes('/system/ping')) return Promise.resolve(PING_OK);
            return Promise.resolve({
                status: 200,
                data: {
                    data: [{
                        name: 'payments-2.3.0.jar',
                        repo_full_path: 'example-repo-local/com/acme/payments-2.3.0.jar',
                        sec_issues: { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
                        violations: 0
                    }],
                    offset: 0
                }
            });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'AnthropicApiKey secret not configured; posted raw Xray stats instead of an AI summary.'
        });
        expect(context.clients.axios.post).not.toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.anything(), expect.anything());
    });
});
