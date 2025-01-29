import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BeforeDownloadRequest, DownloadStatus } from './types';
import runWorker from './worker';

describe("resctrict-download-if-no-xray-scan-since tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<BeforeDownloadRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<BeforeDownloadRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'Overwritten by worker-service if an error occurs.',
            status: DownloadStatus.DOWNLOAD_PROCEED
        }))
    })
});