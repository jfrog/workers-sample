# JFrog Workers Samples

## JFrog Workers

JFrog Workers is a service in the JFrog Platform that provides a serverless execution environment.
You can create workers that react to events in the JFrog Platform similar to AWS Lambda services.
Workers service provides more flexibility to accomplish your use cases.
You can use these workers to perform certain tasks that extend the capabilities of the JFrog Platform according to your requirements.

See the full documentation [here](https://jfrog.com/help/r/jfrog-platform-administration-documentation/workers).

## Using the samples

This repository contains a collection of sample workers for common use cases. Feel free to use, modify, and extend these samples to accomplish your use cases.

We have created these TypeScript samples based on [Artifactory User Plugin Samples](https://github.com/jfrog/artifactory-user-plugins).

Please submit a pull request if you have other valuable samples.

The samples are located under the _samples_ directory with the following layout:
```
<REPO_ROOT>/samples
    /<PRODUCT_NAME> // Must match the product name used in the action metadata
	    /<ACTION>
		    /<WORKER_NAME>
                /README.md // (optional) The Worker doc
                /worker.ts // The Worker code
                /manifest.json // Metadata of the Worker
                /payload-example.json // (optional) Defines an example of the event’s payload content.
```

Each sample folder has been generated with the [JFrog CLI](https://docs.jfrog-applications.jfrog.io/jfrog-applications/jfrog-cli).

The worker code resides in a file named _worker.ts_.

For an introduction on how to develop JFrog Workers using the JFrog CLI checkout [this blogpost](https://jfrog.com/blog/doing-devops-your-way-on-saas-solutions-connecting-jfrog-cli-to-your-jfrog-workers/).

You can also refer to the [documentation](https://jfrog.com/help/r/jfrog-platform-administration-documentation/workers) to discover how to setup and use workers.

## Contributing

Feel free to contribute new samples, and please create issues if you need our support.

---

Copyright &copy; 2023-* JFrog Ltd.
