import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BeforePropertyCreateRequest, BeforePropertyCreateStatus } from './types';
import runWorker from './worker';

describe("create-property-permission tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<BeforePropertyCreateRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<BeforePropertyCreateRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'Overwritten by worker-service if an error occurs.',
            status: BeforePropertyCreateStatus.BEFORE_PROPERTY_CREATE_PROCEED
        }))
    })
});