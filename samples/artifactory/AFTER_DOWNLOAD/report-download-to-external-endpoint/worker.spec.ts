import { PlatformContext, AfterDownloadRequest, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("report-download-to-external-endpoint tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<AfterDownloadRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'proceed'
        }))
    })
});