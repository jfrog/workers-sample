import { PlatformContext, AfterDownloadRequest, AfterDownloadResponse } from 'jfrog-workers';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // MODIFY THOSE TWO CONSTANTS TO FIT YOUR NEEDS
    const URL = 'https://<external_endpoint>';
    const SECRET_NAME = 'myBearerToken';

    let message = 'Download activity successfully logged';
    try {
        const downloadLog = `The artifact '${data.metadata.repoPath.path}' has been downloaded by the ${data.userContext.isToken ? 'token' : 'userid'}: ${data.userContext.id} from the repository '${data.metadata.repoPath.key}'.`;
        const res = await context.clients.axios.post(URL, {
            downloadLog
        }, <AxiosRequestConfig>{
            headers: {
                Authorization: `bearer ${context.secrets.get(SECRET_NAME)}`
            }
        });
        if (res.status === 200) {
            console.log("Successfuly logged download");
        } else {
            console.warn(`Failed to log download activity. Status code : ${res.status}`);
            message = 'Failed to log download activity';
        }
    } catch (error) {
        console.error(`Failed to log download activity, caused by : ${error.message}`)
        message = 'Failed to log download activity';
    }

    return {
        message
    }
}
