import {App} from "octokit";
import {Context} from "aws-lambda";
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {PublishCommand, SNSClient} from '@aws-sdk/client-sns';

interface Payload {
    repository: {
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
    deployment_callback_url: string
}

async function sendMessage(topicArn: string, message: string): Promise<string> {
    const snsClient = new SNSClient({});

    const response = await snsClient.send(new PublishCommand({
        TopicArn: topicArn,
        Message: message
    }));
    return response.MessageId ?? '';
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

export async function webhook(event: any, context: Context): Promise<any> {
    const privateKey = await getPrivateKeyFromSSM(process.env.GH_PRIVATE_KEY!);

    const app = new App({
        appId: process.env.GH_APP_ID!,
        privateKey: privateKey,
    });

    console.info("Received event:", event.body)

    // Assuming event is the JSON payload sent to the Lambda Function URL
    const payload: Payload = JSON.parse(event.body || '{}');

    const {repository, deployment, installation} = payload;
    const octokit = await app.getInstallationOctokit(installation.id);

    const updatePath = payload.deployment_callback_url.replace('https://api.github.com/', '')
    await sendMessage(process.env.SNS_TOPIC_ARN!, `
    environment: ${deployment.environment}
    repository: ${repository.name}
    
    STATUS:  ${process.env.UPDATER_FUNCTION_URL}status/${updatePath}?id=${installation.id}&env=${deployment.environment}&message=Status+message
    APPROVE: ${process.env.UPDATER_FUNCTION_URL}approve/${updatePath}?id=${installation.id}&env=${deployment.environment}&message=APPROVED
    REJECT:  ${process.env.UPDATER_FUNCTION_URL}reject/${updatePath}?id=${installation.id}&env=${deployment.environment}&message=REJECTED
    `);
    //
    // try {
    //     // await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule', {
    //     await octokit.request(`POST ${payload.deployment_callback_url}`, {
    //         environment_name: deployment.environment,
    //         comment: 'Processing rule...',
    //         // state: 'approved'
    //     });
    //
    //     await sendMessage(process.env.SNS_TOPIC_ARN!, `Workflow for: ${repository.name}`)
    //     return {
    //         statusCode: 200,
    //         body: JSON.stringify({message: "Status message published"})
    //     };
    // } catch (error) {
    //     console.error(error);
    //     return {
    //         statusCode: 500,
    //         body: JSON.stringify({message: "Failed to publish status message"})
    //     };
    // }
}


export async function update(event: any, context: Context): Promise<any> {
    const privateKey = await getPrivateKeyFromSSM(process.env.GH_PRIVATE_KEY!);
    const app = new App({
        appId: process.env.GH_APP_ID!,
        privateKey: privateKey,
    });

    const path = event.rawPath;
    const method = event.httpMethod;
    const queryStringParameters = event.queryStringParameters;
    const environment_name = queryStringParameters.env;
    const comment = queryStringParameters.message;
    let state = '';
    let callbackUrl = '';
    switch (path.split('/')[1]) {
        case 'approve':
            state = 'approved';
            callbackUrl = path.replace('/approve', '');
            break;
        case 'reject':
            state = 'rejected';
            callbackUrl = path.replace('/reject', '');
            break;
        case 'status':
            state = '';
            callbackUrl = path.replace('/status', '');
            break;
        default:
            state = '';
            callbackUrl = '';
    }

    const octokit = await app.getInstallationOctokit(queryStringParameters.id);

    try {
        // await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule', {
        await octokit.request(`POST ${callbackUrl}`, {
            environment_name,
            comment,
            state
        });

        return {
            statusCode: 200,
            body: JSON.stringify({message: "Workflow updated", update: {environment_name, comment, state}})
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({message: "Failed to update workflow", update: {environment_name, comment, state}})
        };
    }
}

