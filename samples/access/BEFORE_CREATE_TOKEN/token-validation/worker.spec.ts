import { PlatformContext, BeforeCreateTokenRequest, PlatformClients, PlatformHttpClient, CreateTokenStatus } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("token-validation tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<BeforeCreateTokenRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<BeforeCreateTokenRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'Overwritten by worker-service if an error occurs.',
            status: CreateTokenStatus.CREATE_TOKEN_PROCEED
        }))
    })
});