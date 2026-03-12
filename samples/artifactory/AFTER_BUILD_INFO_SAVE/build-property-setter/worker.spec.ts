import {PlatformContext, PlatformClients, PlatformHttpClient, Status} from 'jfrog-workers';
import {createMock, DeepMocked} from '@golevelup/ts-jest';
import {AfterBuildInfoSaveRequest} from './types';
import runWorker from './worker';

describe("build-property-setter worker", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterBuildInfoSaveRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({
                        status: 200,
                        data: {buildsNumbers: [], buildInfo: {modules: []}}
                    }),
                    put: jest.fn().mockResolvedValue({status: 204}),
                    delete: jest.fn().mockResolvedValue({status: 204})
                })
            })
        });
        request = createMock<AfterBuildInfoSaveRequest>({
            build: {
                name: 'test-build',
                number: '123'
            }
        });
    });

    it('should handle first build scenario', async () => {
        // Simulate no previous builds
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {buildsNumbers: [], buildInfo: {modules: []}}
        });

        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: expect.stringContaining('Successfully set property for artifacts'),
                executionStatus: Status.STATUS_SUCCESS
            })
        );
    });

    it('should call delete API for past artifacts in past builds', async () => {
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildsNumbers: [{uri: '/12356'}],
                buildInfo: {modules: []}
            }
        });

        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildInfo: {
                    modules: [
                        {
                            id: 'module1',
                            artifacts: [
                                {
                                    name: 'artifact1.jar',
                                    sha1: 'abc',
                                    md5: 'def',
                                    type: 'jar',
                                    remotePath: 'repo/path/artifact1.jar'
                                }
                            ]
                        }
                    ]
                }
            }
        });

        await runWorker(context, request);

        expect(context.clients.platformHttp.delete).toHaveBeenCalled();
    });

    it('should call put API to set properties for artifacts in current build', async () => {
        // Mock: No previous builds
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {buildsNumbers: [], buildInfo: {modules: []}}
        });
        // Mock: Current build details with one artifact
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildInfo: {
                    modules: [
                        {
                            id: 'module1',
                            artifacts: [
                                {
                                    name: 'artifact2.jar',
                                    sha1: 'xyz',
                                    md5: 'uvw',
                                    type: 'jar',
                                    originalDeploymentRepo: 'my-repo',
                                    path: 'some/path/artifact2.jar'
                                }
                            ]
                        }
                    ]
                }
            }
        });

        await runWorker(context, request);

        expect(context.clients.platformHttp.put).toHaveBeenCalledWith(
            expect.stringContaining('/artifactory/api/storage/my-repo/some/path/artifact2.jar?properties=latest=true')
        );
    });

    it('should handle past build with module having no artifacts, but log a warning', async () => {

        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildsNumbers: [{uri: '/12356'}],
                buildInfo: {modules: []}
            }
        });

        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildInfo: {
                    modules: [
                        {id: 'module1'} // no artifacts property
                    ]
                }
            }
        });

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        });
        await runWorker(context, request);
        expect(consoleWarnSpy).toHaveBeenCalledWith("A module was skipped as no artifact array was found");
        consoleWarnSpy.mockRestore();
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: expect.stringContaining('Successfully set property for artifacts'),
                executionStatus: Status.STATUS_SUCCESS
            })
        );
    });

    it('should return fail status if set property API call fails', async () => {
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {buildsNumbers: [], buildInfo: {modules: []}}
        });
        // Mock: Current build details with one artifact
        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildInfo: {
                    modules: [
                        {
                            id: 'module1',
                            artifacts: [
                                {
                                    name: 'artifact2.jar',
                                    sha1: 'xyz',
                                    md5: 'uvw',
                                    type: 'jar',
                                    originalDeploymentRepo: 'my-repo',
                                    path: 'some/path/artifact2.jar'
                                }
                            ]
                        }
                    ]
                }
            }
        });
        // Mock: setProperty (put) fails
        (context.clients.platformHttp.put as jest.Mock).mockResolvedValueOnce({
            status: 400
        });

        const result = await runWorker(context, request);

        expect(result).toEqual(
            expect.objectContaining({
                message: expect.stringContaining('Error occurred'),
                executionStatus: Status.STATUS_FAIL
            })
        );
    });

    it('should return fail status if fetching artifact details for a past build fails', async () => {

        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 200,
            data: {
                buildsNumbers: [{uri: '/12356'}],
                buildInfo: {modules: []}
            }
        });

        (context.clients.platformHttp.get as jest.Mock).mockResolvedValueOnce({
            status: 404,
            data: {}
        });

        const result = await runWorker(context, request);

        expect(result).toEqual(
            expect.objectContaining({
                message: expect.stringContaining('Error occurred'),
                executionStatus: Status.STATUS_FAIL
            })
        );
    });
});