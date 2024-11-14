import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker, { RemoteBackupPayload, joinPath, buildRepoPath } from './worker';

describe("remote-backup tests", () => {
    let context: DeepMocked<PlatformContext>;
    const request: RemoteBackupPayload = {
        backups: {
            src: 'dest'
        },
        dryRun: false,
        checksums: false
    };

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({
                        status: 200,
                        data: [
                            { type: 'a' },
                            { type: 'a' },
                            { type: 'b' },
                            { type: 'c' }
                        ],
                    })
                })
            })
        });
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            repositories: expect.objectContaining({
                a: 2, b: 1, c: 1
            })
        }))
    })

    describe("joinPath function", () => {
        it("should join two paths correctly when left path ends with '/'", () => {
            expect(joinPath("left/", "right")).toBe("left/right");
        });

        it("should join two paths correctly when left path does not end with '/'", () => {
            expect(joinPath("left", "right")).toBe("left/right");
        });

        it("should join two paths correctly when right path starts with '/'", () => {
            expect(joinPath("left", "/right")).toBe("left/right");
        });

        it("should join two paths correctly when both paths are empty", () => {
            expect(joinPath("", "")).toBe("/");
        });

        it("should join two paths correctly when left path is empty", () => {
            expect(joinPath("", "right")).toBe("/right");
        });

        it("should join two paths correctly when right path is empty", () => {
            expect(joinPath("left", "")).toBe("left/");
        });
    });

    describe("buildRepoPath function", () => {
        it("should build repo path correctly when path starts with repo", () => {
            const result = buildRepoPath("repo/path/to/file", "repo");
            expect(result).toEqual({
                path: "repo/path/to/file",
                repo: "repo",
                name: "file"
            });
        });

        it("should build repo path correctly when path does not start with repo", () => {
            const result = buildRepoPath("path/to/file", "repo");
            expect(result).toEqual({
                path: "repo/path/to/file",
                repo: "repo",
                name: "file"
            });
        });

        it("should build repo path correctly when repo is not provided", () => {
            const result = buildRepoPath("repo/path/to/file");
            expect(result).toEqual({
                path: "repo/path/to/file",
                repo: "repo",
                name: "file"
            });
        });

        it("should build repo path correctly when path has only one part and repo is not provided", () => {
            const result = buildRepoPath("repo");
            expect(result).toEqual({
                path: "repo",
                repo: "repo",
                name: ""
            });
        });

        it("should build repo path correctly when path has only one part and repo is provided", () => {
            const result = buildRepoPath("file", "repo");
            expect(result).toEqual({
                path: "repo/file",
                repo: "repo",
                name: "file"
            });
        });
    });
});