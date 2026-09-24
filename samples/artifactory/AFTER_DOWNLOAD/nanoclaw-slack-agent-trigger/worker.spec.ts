import { PlatformContext, PlatformClients } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AfterDownloadRequest, RepoType } from './types';
import runWorker from './worker';

describe('nanoclaw-slack-agent-trigger tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;
    let postMock: jest.Mock;
    let getPropertyMock: jest.Mock;

    beforeEach(() => {
        postMock = jest.fn().mockResolvedValue({ status: 200, data: { ok: true } });
        getPropertyMock = jest.fn((key: string) =>
            ({ slackChannelId: 'C0123456789', triggerPrefix: 'nanoclaw-audit:' })[key],
        );
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                axios: { post: postMock } as any,
            }),
            secrets: { get: jest.fn().mockReturnValue('xoxb-test-token') } as any,
            properties: { get: getPropertyMock } as any,
        });
        request = createMock<AfterDownloadRequest>({
            metadata: {
                repoPath: {
                    key: 'npm-remote',
                    path: 'left-pad/-/left-pad-1.3.0.tgz',
                    id: 'npm-remote:left-pad/-/left-pad-1.3.0.tgz',
                    isRoot: false,
                    isFolder: false,
                },
                repoType: RepoType.REPO_TYPE_REMOTE,
            } as any,
            userContext: {
                id: 'nanoclaw-agent-group-artifactory-token',
                isToken: true,
                realm: '',
            },
        });
    });

    it('notifies the NanoClaw agent via Slack and reports success', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'NanoClaw agent notified via Slack' }),
        );
        expect(getPropertyMock).toHaveBeenCalledWith('slackChannelId');
        expect(postMock).toHaveBeenCalledWith(
            'https://slack.com/api/chat.postMessage',
            expect.objectContaining({
                channel: 'C0123456789',
                text: expect.stringContaining('nanoclaw-audit:'),
            }),
            expect.objectContaining({ headers: { Authorization: 'Bearer xoxb-test-token' } }),
        );
        expect(postMock.mock.calls[0][1].text).toContain('left-pad/-/left-pad-1.3.0.tgz');
    });

    it('skips notifying when the slackChannelId property is not set', async () => {
        getPropertyMock.mockReturnValueOnce(undefined);
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: "Worker property 'slackChannelId' is not set; skipping Slack notification",
            }),
        );
        expect(postMock).not.toHaveBeenCalled();
    });

    it('skips notifying when the triggerPrefix property is not set', async () => {
        getPropertyMock.mockImplementation((key: string) => ({ slackChannelId: 'C0123456789' })[key]);
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: "Worker property 'triggerPrefix' is not set; skipping Slack notification",
            }),
        );
        expect(postMock).not.toHaveBeenCalled();
    });

    it('reports failure when Slack returns a logical error (ok: false)', async () => {
        postMock.mockResolvedValueOnce({ status: 200, data: { ok: false, error: 'channel_not_found' } });
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to notify NanoClaw agent via Slack' }),
        );
    });

    it('reports failure when the Slack call throws', async () => {
        postMock.mockRejectedValueOnce(new Error('network error'));
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to notify NanoClaw agent via Slack' }),
        );
    });
});
