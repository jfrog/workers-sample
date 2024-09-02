import { PlatformContext, AfterCreateRequest, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("check-image-signature tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterCreateRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<AfterCreateRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'proceed'
        }))
    })
});