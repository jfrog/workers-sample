import { PlatformContext, PlatformClients, PlatformHttpClient, PlatformSecrets, PlatformProperties } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BeforeDownloadRequest, DownloadStatus } from './types';
import runWorker from './worker';

const PING_OK = { status: 200, data: { status: 'pong' } };
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const SLACK_URL = 'https://hooks.slack.test/services/xyz';
const BLOCKED = 'DOWNLOAD STOPPED: example-repo-local/com/acme/payments-2.3.0.jar has 2 critical security issues (limit 0).';

function scanWith(critical: number) {
    return {
        status: 200,
        data: {
            data: [{
                name: 'payments-2.3.0.jar',
                repo_full_path: 'example-repo-local/com/acme/payments-2.3.0.jar',
                sec_issues: { critical, high: 0, medium: 0, low: 0, total: critical },
                violations: 0
            }],
            offset: 0
        }
    };
}

const SUMMARY = {
    status: 200,
    data: {
        artifacts: [{
            general: { component_id: 'com.fasterxml.jackson.core:jackson-databind:2.9.8' },
            issues: [
                { issue_id: 'XRAY-88210', summary: 'A Polymorphic Typing issue was discovered in FasterXML jackson-databind before 2.9.10.', severity: 'Critical', cves: [{ cve: 'CVE-2019-16335' }] },
                { issue_id: 'XRAY-2', summary: 'Low severity issue', severity: 'Low' }
            ]
        }]
    }
};

function buildRequest(overrides: any = {}): DeepMocked<BeforeDownloadRequest> {
    return createMock<BeforeDownloadRequest>({
        metadata: {
            repoPath: { key: 'example-repo-local', path: 'com/acme/payments-2.3.0.jar' },
            headOnly: false,
            checksum: false,
            ...overrides
        } as any,
        userContext: { id: 'alice', isToken: false } as any
    });
}

function buildContext(critical: number): DeepMocked<PlatformContext> {
    return createMock<PlatformContext>({
        clients: createMock<PlatformClients>({
            platformHttp: createMock<PlatformHttpClient>({
                get: jest.fn().mockImplementation((endpoint: string) =>
                    Promise.resolve(endpoint.includes('/system/ping') ? PING_OK : scanWith(critical))),
                post: jest.fn().mockResolvedValue(SUMMARY)
            }),
            axios: createMock<any>({
                post: jest.fn().mockResolvedValue({ status: 200, data: { content: [{ type: 'text', text: 'Upgrade jackson-databind\nto 2.9.10 or later.' }] } })
            })
        }),
        secrets: createMock<PlatformSecrets>({
            get: jest.fn().mockImplementation((key: string) => key === 'AnthropicApiKey' ? 'sk-ant-test' : undefined)
        }),
        properties: createMock<PlatformProperties>({
            get: jest.fn().mockReturnValue(undefined)
        })
    });
}

describe('ai-blocked-download-explainer tests', () => {
    it('warns and proceeds when Xray is not available', async () => {
        const context = buildContext(2);
        context.clients.platformHttp.get = jest.fn().mockRejectedValue(new Error('unreachable'));

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_WARN);
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('warns and proceeds when no matching Xray scan result is found', async () => {
        const context = buildContext(2);
        context.clients.platformHttp.get = jest.fn().mockImplementation((endpoint: string) =>
            Promise.resolve(endpoint.includes('/system/ping') ? PING_OK : { status: 200, data: { data: [], offset: 0 } }));

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_WARN);
    });

    it('proceeds without calling Claude when under the limit', async () => {
        const context = buildContext(0);

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('blocks with the Claude explanation appended, on one line', async () => {
        const context = buildContext(2);

        await expect(runWorker(context, buildRequest())).resolves.toEqual({
            status: DownloadStatus.DOWNLOAD_STOP,
            message: `${BLOCKED} Upgrade jackson-databind to 2.9.10 or later.`,
            headers: {}
        });
        expect(context.clients.platformHttp.post).toHaveBeenCalledWith('/xray/api/v1/summary/artifact', { paths: ['default/example-repo-local/com/acme/payments-2.3.0.jar'] });
        const [url, body, options] = (context.clients.axios.post as jest.Mock).mock.calls[0];
        expect(url).toBe(CLAUDE_URL);
        expect(body.model).toBe('claude-haiku-4-5-20251001');
        expect(body.messages[0].content).toContain('CVE-2019-16335: A Polymorphic Typing issue was discovered in FasterXML jackson-databind before 2.9.10.');
        expect(body.messages[0].content).toContain('Component: com.fasterxml.jackson.core:jackson-databind:2.9.8');
        expect(body.messages[0].content).not.toContain('Low severity issue');
        expect(options).toEqual({ headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }) }); // the Workers runtime rejects axios' 'timeout' option
    });

    it('sends every critical issue to Claude, not just the first few', async () => {
        const context = buildContext(8);
        context.clients.platformHttp.post = jest.fn().mockResolvedValue({
            status: 200,
            data: { artifacts: [{ issues: Array.from({ length: 8 }, (_, i) => ({ issue_id: `XRAY-${i}`, summary: `issue ${i}`, severity: 'Critical', cves: [{ cve: `CVE-2019-000${i}` }] })) }] }
        });

        await runWorker(context, buildRequest());

        expect((context.clients.axios.post as jest.Mock).mock.calls[0][1].messages[0].content).toContain('CVE-2019-0007: issue 7');
    });

    it('still blocks with the static message when Claude fails', async () => {
        const context = buildContext(2);
        context.clients.axios.post = jest.fn().mockRejectedValue(new Error('Request failed with status code 529'));

        await expect(runWorker(context, buildRequest())).resolves.toEqual({ status: DownloadStatus.DOWNLOAD_STOP, message: BLOCKED, headers: {} });
    });

    it('still asks Claude from counts only when the Xray summary fails', async () => {
        const context = buildContext(2);
        context.clients.platformHttp.post = jest.fn().mockRejectedValue(new Error('500'));

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
        expect((context.clients.axios.post as jest.Mock).mock.calls[0][1].messages[0].content).toContain('No further details available.');
    });

    it('blocks with the static message when AnthropicApiKey is not configured', async () => {
        const context = buildContext(2);
        context.secrets.get = jest.fn().mockReturnValue(undefined);

        await expect(runWorker(context, buildRequest())).resolves.toEqual({ status: DownloadStatus.DOWNLOAD_STOP, message: BLOCKED, headers: {} });
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('does not call Claude or Slack for HEAD or checksum requests', async () => {
        for (const overrides of [{ headOnly: true }, { checksum: true }]) {
            const context = buildContext(2);
            context.secrets.get = jest.fn().mockImplementation((key: string) =>
                ({ AnthropicApiKey: 'sk-ant-test', Slack_URL: SLACK_URL } as any)[key]);

            await expect(runWorker(context, buildRequest(overrides))).resolves.toEqual({ status: DownloadStatus.DOWNLOAD_STOP, message: BLOCKED, headers: {} });
            expect(context.clients.axios.post).not.toHaveBeenCalled();
        }
    });

    it('posts the block message with the Claude explanation to Slack', async () => {
        const context = buildContext(2);
        context.secrets.get = jest.fn().mockImplementation((key: string) =>
            ({ AnthropicApiKey: 'sk-ant-test', Slack_URL: SLACK_URL } as any)[key]);

        const result = await runWorker(context, buildRequest());

        expect(result.message).toBe(`${BLOCKED} Upgrade jackson-databind to 2.9.10 or later.`);
        expect(context.clients.axios.post).toHaveBeenCalledWith(SLACK_URL, { text: `*Download blocked* for User alice\n${result.message}` });
    });

    it('posts the static block message to Slack when Claude fails', async () => {
        const context = buildContext(2);
        context.secrets.get = jest.fn().mockImplementation((key: string) =>
            ({ AnthropicApiKey: 'sk-ant-test', Slack_URL: SLACK_URL } as any)[key]);
        context.clients.axios.post = jest.fn().mockImplementation((url: string) =>
            url === CLAUDE_URL ? Promise.reject(new Error('Request failed with status code 529')) : Promise.resolve({ status: 200 }));

        await expect(runWorker(context, buildRequest())).resolves.toEqual({ status: DownloadStatus.DOWNLOAD_STOP, message: BLOCKED, headers: {} });
        expect(context.clients.axios.post).toHaveBeenCalledWith(SLACK_URL, { text: `*Download blocked* for User alice\n${BLOCKED}` });
    });

    it('still blocks when the Slack post fails', async () => {
        const context = buildContext(2);
        context.secrets.get = jest.fn().mockImplementation((key: string) => key === 'Slack_URL' ? SLACK_URL : undefined);
        context.clients.axios.post = jest.fn().mockRejectedValue(new Error('Request failed with status code 404'));

        await expect(runWorker(context, buildRequest())).resolves.toEqual({ status: DownloadStatus.DOWNLOAD_STOP, message: BLOCKED, headers: {} });
    });

    it('falls back to property defaults when context.properties.get throws', async () => {
        const context = buildContext(2);
        context.properties.get = jest.fn().mockImplementation(() => { throw new Error('unknown property key'); });

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
    });

    it('honours the maxCriticalIssues property', async () => {
        const context = buildContext(2);
        context.properties.get = jest.fn().mockImplementation((key: string) => key === 'maxCriticalIssues' ? '2' : undefined);

        const result = await runWorker(context, buildRequest());

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
    });
});
