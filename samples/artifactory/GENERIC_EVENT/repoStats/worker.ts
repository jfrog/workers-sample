import { PlatformContext } from 'jfrog-workers';

interface RepoStatsPayload {
  paths: string
};

interface RepoStatsResponse {
  error: string | undefined,
  message: string | undefined
  stats: RepoStat[],
};

interface RepoStat {
  repoPath: string,
  count: number,
  usedSpace: string,
  usedSpaceInBytes: number
}

export default async (context: PlatformContext, data: RepoStatsPayload): Promise<RepoStatsResponse> => {

  const response: RepoStatsResponse = {
    error: undefined,
    message: undefined,
    stats: []
  };

  if (!data.paths) {
    response.error = `repoKey is missing`;
    return response;
  }

  try {
    const storageinfo = await context.clients.platformHttp.get('/artifactory/api/storageinfo');
    if (storageinfo.status !== 200) {
      response.error = `Request is successful but returned an unexpected status : ${storageinfo.status}`;
      return response;
    }
    const repositoriesSummaryList = storageinfo.data?.repositoriesSummaryList;
    if (!repositoriesSummaryList) {
      response.error = `No repositories summary available ${JSON.stringify(storageinfo.data)}`;
      return response;
    }

    const repoKeys: Set<string> = new Set(data.paths.split(","));
    let repoFound: string = "";
    for (const repoData of repositoriesSummaryList) {
      if (repoKeys.has(repoData.repoKey)) {
        response.stats.push({
          "repoPath": repoData.repoKey,
          "count": repoData.itemsCount,
          "usedSpaceInBytes": repoData.usedSpaceInBytes,
          "usedSpace": repoData.usedSpace
        })
        repoFound += `${repoData.repoKey},`;
      }
    }
    repoFound = repoFound.slice(0, -1);
    response.message = repoFound ? `Path exists: ${repoFound}` : `No Path exists`;
  } catch (error) {
    response.error = `Request failed with status code ${error.status ?? '<none>'} caused by : ${error.message}`;
    console.error(response.error);
  }
  return response;
}