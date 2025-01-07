import { PlatformContext } from "jfrog-workers";

enum StrategyNameEnum {
  GRADLE = "gradle",
  DETAILED_MAVEN = "detailedMaven",
  SIMPLE_MAVEN = "simpleMaven",
}

type Params = {
  [key: string]: string;
};

type StagingStrategyRequest = {
  strategyName: string;
  params: Params;
  buildName: string;
};

type StagingStrategyResponseData = {
  useReleaseBranch: boolean;
  createTag: boolean;
  tagUrlOrName: string;
  tagComment: string;
  nextDevelopmentVersionComment: string;
  targetRepository: string;
  promotionConfigComment: string;
};

type BuildRun = {
  releaseStatus?: string;
  startedDate: Date;
  modules: Array<{ id: string }>;
};

type StagingStrategyResponse = {
  status: number;
  data: StagingStrategyResponseData;
  message: string;
};
export default async function getStagingStrategy(
  context: PlatformContext,
  data: StagingStrategyRequest
): Promise<StagingStrategyResponse> {
  try {
    const strategy = StrategyExecutionFactory.getExecution(data.strategyName);
    const responseData = await strategy.execute(
      data.buildName,
      data.params,
      context
    );
    return {
      status: 200,
      message: "Successfully calculated staging strategy",
      data: responseData,
    };
  } catch (error) {
    console.log(error);
    return {
      status: 400,
      message: `Got error: ${error.message}`,
      data: null,
    };
  }
}

interface ExecutorStrategy {
  execute(
    buildName: string,
    params: Params,
    context: PlatformContext
  ): Promise<StagingStrategyResponseData>;
}

class VersionUtil {
  static transformReleaseVersion(version: string, patch: boolean): string {
    const versionPattern = /(?:\d+)\.(?:\d+)\.(\d+)(\D{1})?/;
    const match = version.match(versionPattern);

    if (match) {
      const [_, lastNumber, optionalChar] = match;
      if (optionalChar) {
        return patch
          ? version.replace(
              optionalChar,
              String.fromCharCode(optionalChar.charCodeAt(0) + 1)
            )
          : this.transformReleaseVersion(
              version.replace(optionalChar, ""),
              false
            );
      } else {
        return patch
          ? version + "a"
          : version.replace(lastNumber, String(Number(lastNumber) + 1));
      }
    }
    return version;
  }

  static getLatestVersion(
    builds: BuildRun[],
    isSimple: boolean = false
  ): BuildRun | null {
    const releasedBuilds = builds.filter(
      (build) => build.releaseStatus === "Released"
    );
    const relevantBuilds = releasedBuilds.length > 0 ? releasedBuilds : builds;
    return relevantBuilds.sort(
      (a, b) => b.startedDate.getTime() - a.startedDate.getTime()
    )[0];
  }
}

class GradleExecutorStrategy implements ExecutorStrategy {
  public async execute(
    buildName: string,
    params: Params,
    context: PlatformContext
  ): Promise<StagingStrategyResponseData> {
    const builds = await getBuilds(buildName, context);
    const latestBuild = VersionUtil.getLatestVersion(builds);

    let releaseVersion = "1.0.0";
    if (latestBuild) {
      releaseVersion = VersionUtil.transformReleaseVersion(
        latestBuild.modules[0]?.id.split(":").pop() || "",
        params["patch"] === "true"
      );
    }

    const nextDevVersion = `${VersionUtil.transformReleaseVersion(
      releaseVersion,
      false
    )}-SNAPSHOT`;

    const response = {
      useReleaseBranch: false,
      createTag: true,
      tagUrlOrName: `gradle-multi-example-${releaseVersion}`,
      tagComment: `[gradle-multi-example] Release version ${releaseVersion}`,
      nextDevelopmentVersionComment:
        "[gradle-multi-example] Next development version",
      targetRepository: "gradle-staging-local",
      promotionConfigComment: `Staging Artifactory ${releaseVersion}`,
    };

    console.log({
      useReleaseBranch: false,
      createTag: true,
      tagUrlOrName: `gradle-multi-example-${releaseVersion}`,
      tagComment: `[gradle-multi-example] Release version ${releaseVersion}`,
      nextDevelopmentVersionComment:
        "[gradle-multi-example] Next development version",
      targetRepository: "gradle-staging-local",
      promotionConfigComment: `Staging Artifactory ${releaseVersion}`,
    });
    return response;
  }
}

async function getBuilds(
  buildName: string,
  context: PlatformContext
): Promise<BuildRun[]> {
  const response = await context.clients.platformHttp.get(
    `artifactory/api/build/${buildName}`
  );
  return response.data;
}

class SimpleMavenExecutorStrategy implements ExecutorStrategy {
  public async execute(
    buildName: string,
    params: Params,
    context: PlatformContext
  ): Promise<StagingStrategyResponseData> {
    const builds = await getBuilds(buildName, context);
    const latestBuild = VersionUtil.getLatestVersion(builds, true);

    if (latestBuild) {
      const module = latestBuild.modules[0];
      const version = module.id.split(":").pop() || "";
      const releaseVersion = VersionUtil.transformReleaseVersion(
        version,
        false
      );
      const response = {
        useReleaseBranch: false,
        createTag: true,
        tagUrlOrName: `rel-${releaseVersion}`,
        tagComment: `[artifactory-release] Release version ${releaseVersion}`,
        nextDevelopmentVersionComment:
          "[artifactory-release] Next development version",
        targetRepository: "staging-local",
        promotionConfigComment: `Staging Artifactory ${releaseVersion}`,
      };

      console.log({
        useReleaseBranch: false,
        createTag: true,
        tagUrlOrName: `rel-${releaseVersion}`,
        tagComment: `[artifactory-release] Release version ${releaseVersion}`,
        nextDevelopmentVersionComment:
          "[artifactory-release] Next development version",
        targetRepository: "staging-local",
        promotionConfigComment: `Staging Artifactory ${releaseVersion}`,
      });
      return response;
    }
  }
}

class DetailedMavenExecutorStrategy implements ExecutorStrategy {
  public async execute(
    buildName: string,
    params: Params,
    context: PlatformContext
  ): Promise<StagingStrategyResponseData> {
    const builds = await getBuilds(buildName, context);
    const latestBuild = VersionUtil.getLatestVersion(builds);

    if (latestBuild) {
      const moduleIdPattern = /(?:.+)\:(?:.+)\:(.+)/;
      const moduleVersionsMap: { [key: string]: any } = {};

      latestBuild.modules.forEach((module, index) => {
        const match = module.id.match(moduleIdPattern);
        if (match) {
          const [_, version] = match;
          const moduleKey = module.id.replace(`:${version}`, "");
          const releaseVersion = VersionUtil.transformReleaseVersion(
            version,
            false
          );

          moduleVersionsMap[moduleKey] = {
            moduleKey,
            releaseVersion: `${releaseVersion}-${index}`,
            nextDevVersion: `${releaseVersion}-SNAPSHOT`,
          };
        }
      });

      const response = {
        useReleaseBranch: false,
        createTag: true,
        tagUrlOrName: "multi-modules/tags/artifactory",
        tagComment: "[artifactory-release] Release version",
        nextDevelopmentVersionComment:
          "[artifactory-release] Next development version",
        targetRepository: "libs-snapshot-local",
        promotionConfigComment: "Staging Artifactory detailed",
      };

      console.log({
        useReleaseBranch: false,
        createTag: true,
        tagUrlOrName: "multi-modules/tags/artifactory",
        tagComment: "[artifactory-release] Release version",
        nextDevelopmentVersionComment:
          "[artifactory-release] Next development version",
        targetRepository: "libs-snapshot-local",
        promotionConfigComment: "Staging Artifactory detailed",
      });
      return response;
    }
  }
}

class StrategyExecutionFactory {
  public static getExecution(strategyName: string): ExecutorStrategy {
    switch (strategyName) {
      case StrategyNameEnum.GRADLE:
        return new GradleExecutorStrategy();
      case StrategyNameEnum.SIMPLE_MAVEN:
        return new SimpleMavenExecutorStrategy();
      case StrategyNameEnum.DETAILED_MAVEN:
        return new DetailedMavenExecutorStrategy();
      default:
        throw new Error(`Invalid strategy name ${strategyName}`);
    }
  }
}
