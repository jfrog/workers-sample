import { PlatformContext } from 'jfrog-workers';
import archiveOldArtifacts from './worker';

describe('archiveOldArtifacts', () => {
    let context: PlatformContext;

    beforeEach(() => {
        context = {
            clients: {
                platformHttp: {
                    get: jest.fn(),
                    post: jest.fn(),
                    put: jest.fn(),
                },
            },
        } as unknown as PlatformContext;
    });


    it('should throw an error when archiveRepo is missing', async () => {
        const params = {
            filePattern:"example.txt",
            srcRepo: "source-repo",
            archiveRepo:"",
            lastModifiedDays:30,
            lastUpdatedDays:80,
            createdDays:102,
            lastDownloadedDays:20,
            ageDays:102,
            excludePropertySet: "keeper:true",
            includePropertySet: "archive:true",
            archiveProperty: "archived.timestamp",
            numKeepArtifacts: 5
        };

        await expect(() => archiveOldArtifacts(context, params)).rejects.toThrow(
            'Both srcRepo and archiveRepo must be defined, srcRepo: source-repo, archiveRepo: '
        );
    });

    it('should throw an error when any of the day is missing', async () => {
        const params = {
            filePattern: "example.txt",
            srcRepo: "source-repo",
            archiveRepo: "archive-repo",
            lastModifiedDays: 0,
            lastUpdatedDays: 0,
            createdDays: 0,
            lastDownloadedDays: 0,
            ageDays: 0,
            excludePropertySet: "",
            includePropertySet: "",
            archiveProperty: "archived.timestamp",
            numKeepArtifacts: 5
        };

        await expect(archiveOldArtifacts(context, params)).rejects.toThrow(
            'No selection criteria specified!'
        );
    });


});