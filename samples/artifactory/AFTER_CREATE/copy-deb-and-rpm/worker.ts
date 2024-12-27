import { PlatformContext, AfterCreateRequest, AfterCreateResponse } from 'jfrog-workers';


const debRepositoryList = ["debian"]  //if something is created here...
const yumRepositoryList = ["rpm"] //if something is created here...
const yumRepoCopyList   = ["rpm-dest"]    //copy it to the corresponding repo here
const debRepoCopyList   = ["debian-dest"]    //copy it to the corresponding repo here

const layOutRegex = /(?<orgPath>.+?)\/(?<module>[^\/]+?)-(?<baseRev>[^\/]+)\.(?<ext>[a-z]+)/;

export default async (context: PlatformContext, data: AfterCreateRequest): Promise<AfterCreateResponse> => {
    await copyPackage(context, data.metadata.repoPath);

    return {
        message: 'done',
    }
}

async function copyPackage(context: PlatformContext, repoPath: RepoPath) {
    await copyAction(context, repoPath, debRepositoryList);
    await copyAction(context, repoPath, yumRepositoryList);
}

async function copyAction(context: PlatformContext, repoPath: RepoPath, list: string[]) {
    if ((list.includes(repoPath.key)) && (!repoPath.isFolder)) {
        const layoutMatch = layOutRegex.exec(`${repoPath.key}/${repoPath.path}`);
        if (repoPath.path.endsWith("rpm") && layoutMatch) {
            const yumRepoCopy = yumRepoCopyList[list.indexOf(repoPath.key)];
            const newName=renameTimestampToSnapshot(repoPath);
            const dstPath = `${layoutMatch.groups.module}/${newName}`;
            try {
                console.info(`Copying package: ${repoPath.key}/${repoPath.path} to ${yumRepoCopy}/${dstPath}`);
                const res = await retryOnStatus<IPlatformHttpResponse>(() => context.clients.platformHttp.post(`/artifactory/api/copy/${repoPath.key}/${repoPath.path}?to=/${yumRepoCopy}/${dstPath}`), [404, 409], 5, 400);
                if (res.status === 200) {
                    console.info("Copy success");
                } else {
                    console.warn(`Request was successful but returned status code : ${ res.status }`);
                }
            } catch (e) {
                console.error(`Unable to copy artifact to ${yumRepoCopy}: ` + e.message);
            }
        } else if (repoPath.path.endsWith("deb") && layoutMatch) {
            const debRepoCopy = debRepoCopyList[list.indexOf(repoPath.key)];
            const newName=renameTimestampToSnapshot(repoPath);
            const dstPath = `pool/${layoutMatch.groups.module}/${newName}`;
            try {
                console.warn("Updating Debian package properties");
                await retryOnStatus<IPlatformHttpResponse>(() => updateProperties(context, repoPath), 404, 5, 400);
            } catch (e) {
                console.warn(`Could not update properties for ${repoPath.key}/${repoPath.path}: ` + e.message);
            }
            try {
                console.info(`Copying package: ${repoPath.key}/${repoPath.path} to ${debRepoCopy}/${dstPath}`);
                const res = await retryOnStatus<IPlatformHttpResponse>(() => context.clients.platformHttp.post(`/artifactory/api/copy/${repoPath.key}/${repoPath.path}?to=/${debRepoCopy}/${dstPath}`), [404, 409], 5, 400);
                if (res.status === 200) {
                    console.info("Copy success");
                } else {
                    console.warn(`Request was successful but returned status code : ${ res.status }`);
                }
            }
            catch (e) {
                console.error(`Unable to copy artifact to ${debRepoCopy}: ` + e.message);
            }
        }
    }
}

async function updateProperties(context: PlatformContext, repoPath: RepoPath) {
    return context.clients.platformHttp.put(`/artifactory/api/storage/${repoPath.key}/${repoPath.path}?properties=` +
        'deb.distribution=trusty,jessie,xenial,stretch,bionic,buster,focal,jammy;' +
        'deb.component=main;' +
        'deb.architecture=all');
}

function renameTimestampToSnapshot(repoPath: RepoPath): string {
    try{
        const name: string = repoPath.path;
        const timeStampMatch = /\d{8}\.\d{6}-\d{4}/.exec(name);
        if(timeStampMatch) {
            const newName = name.replaceAll(timeStampMatch[0], "SNAPSHOT");
            console.info(`Renaming package ${name} to ${newName}`);
            return newName
        } else {
            return name
        }
    }catch(e) {
        console.warn("Unable to rename Timestamp to Snapshot " + e);
    }
}

// runs the function task and retries maximum nTimes if it fails with one of the given status. The function will wait for a given time defined by intervalMillis between each attempt
async function retryOnStatus<T>(task: () => Promise<T>, status: number | number[], nTimes: number, intervalMillis: number): Promise<T> {
    let currentTrial = 0;
    let success = false;
    let lastStatusCode = undefined;
    let resp = null;
    while (!success && ++currentTrial <= nTimes) {
        try {
            resp = await task();
            success = true;
        } catch (e) {
            if (!e.status) {
                console.error(e.message);
            }
            if ((Array.isArray(status) && !status.includes(e.status)) || (!Array.isArray(status) && e.status !== status)) {
                lastStatusCode = e.status;
                break;
            }
            wait(intervalMillis);
        }
    }
    if (!success) {
        if (currentTrial > nTimes) {
            throw new Error(`Still failing after ${nTimes} tries`);
        } else {
            throw new Error(`Received status code ${lastStatusCode}, not retrying`);
        }
    }
    return resp;
}

function wait(millis: number) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millis);
}
