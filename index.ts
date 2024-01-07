import { App } from "octokit";
import { Context } from "aws-lambda";
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';

interface Payload {
    repository?: {
        owner: { login: string };
        name: string;
    };
    deployment: {
        environment: string;
        id: number;
    };
    installation: {
        id: number;
    };
}

async function getPrivateKeyFromSSM(ssmParameterName: string): Promise<string> {
    const ssmClient = new SSMClient({});
    const getParamCommand = new GetParameterCommand({
        Name: ssmParameterName,
        WithDecryption: true
    });

    const response = await ssmClient.send(getParamCommand);
    return response.Parameter?.Value ?? '';
}

export async function handler(event: any, context: Context): Promise<any> {
    const privateKey = await getPrivateKeyFromSSM(process.env.GH_PRIVATE_KEY!);

    const app = new App({
        appId: process.env.GH_APP_ID!,
        privateKey: privateKey,
    });

    // Assuming event is the JSON payload sent to the Lambda Function URL
    const payload: Payload = JSON.parse(event.body || '{}');

    if (!payload.repository ||
        !payload.deployment ||
        !payload.deployment.environment ||
        !payload.deployment.id ||
        !payload.installation ||
        !payload.installation.id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid payload structure" })
        };
    }

    const { repository, deployment, installation } = payload;
    const octokit = await app.getInstallationOctokit(installation.id);

    try {
        await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule', {
            owner: repository.owner.login,
            repo: repository.name,
            run_id: deployment.id,
            environment_name: deployment.environment,
            comment: 'Processing rule...',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Status message published" })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed to publish status message" })
        };
    }
}
