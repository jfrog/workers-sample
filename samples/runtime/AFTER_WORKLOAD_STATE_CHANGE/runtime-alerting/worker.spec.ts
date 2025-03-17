import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { AfterWorkloadStateChangeRequest } from './types';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("runtime-alerting tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterWorkloadStateChangeRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<AfterWorkloadStateChangeRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: expect.anything(),
        }))
    })
});