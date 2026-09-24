import { PlatformContext } from 'jfrog-workers';
import { AfterDownloadRequest, AfterDownloadResponse, RepoType } from './types';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // MODIFY TO FIT YOUR NEEDS
    const SLACK_CHANNEL_PROPERTY = 'slackChannelId';
    // Must exactly match the `--engage-pattern` regex configured on the NanoClaw wiring for this
    // channel (`ncl wirings create --engage-mode pattern --engage-pattern "^<this value>"`), so the
    // wired agent group's router recognizes this message as input instead of ignoring it. See README.
    const TRIGGER_PREFIX_PROPERTY = 'triggerPrefix';
    const SECRET_NAME = 'slackBotToken';

    let message = 'NanoClaw agent notified via Slack';
    try {
        const repoPath = data.metadata?.repoPath;
        const repoType = data.metadata?.repoType !== undefined ? RepoType[data.metadata.repoType] : 'UNKNOWN';

        const channel = context.properties.get(SLACK_CHANNEL_PROPERTY);
        if (!channel) {
            return { message: `Worker property '${SLACK_CHANNEL_PROPERTY}' is not set; skipping Slack notification` };
        }

        const triggerPrefix = context.properties.get(TRIGGER_PREFIX_PROPERTY);
        if (!triggerPrefix) {
            return { message: `Worker property '${TRIGGER_PREFIX_PROPERTY}' is not set; skipping Slack notification` };
        }

        // The text below is the actual trigger: NanoClaw's Slack adapter ingests it like any other
        // channel message, and its router matches it against the wired agent group's pattern -
        // the agent then decides what to do with it (verify the package, reply, escalate, etc.).
        const text =
            `${triggerPrefix} '${repoPath?.path}' was resolved from repo '${repoPath?.key}' (${repoType}) ` +
            `by registry identity '${data.userContext?.id}'. Please verify this package.`;

        const res = await context.clients.axios.post(
            'https://slack.com/api/chat.postMessage',
            { channel, text },
            {
                headers: {
                    Authorization: `Bearer ${context.secrets.get(SECRET_NAME)}`,
                },
            },
        );

        // The Slack Web API returns HTTP 200 even on a logical failure; the real result is in the body.
        if (res.status === 200 && res.data?.ok) {
            console.log(`Notified NanoClaw agent in channel '${channel}' about '${repoPath?.id}'`);
        } else {
            console.warn(`Slack API rejected the notification: ${res.data?.error ?? res.status}`);
            message = 'Failed to notify NanoClaw agent via Slack';
        }
    } catch (error) {
        console.error(`Failed to notify NanoClaw agent via Slack, caused by: ${(error as Error).message}`);
        message = 'Failed to notify NanoClaw agent via Slack';
    }

    return {
        message,
    };
};
