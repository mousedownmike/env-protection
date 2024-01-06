import {App} from "octokit";


exports.handler = async (event) => {
    const app = new App({
        appId: process.env.GH_APP_ID,
        privateKey: process.env.GH_PRIVATE_KEY,
    })

    console.log(`GitHub payload: ${event.body}`)
    // Parse the GitHub webhook payload
    const payload = JSON.parse(event.body);


    // Check for the necessary payload structure
    if (!payload.repository ||
        !payload.deployment ||
        !payload.deployment.environment ||
        !payload.deployment.id ||
        !payload.installation ||
        !payload.installation.id) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: "Invalid payload structure"})
        };
    }

    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;
    const runId = payload.deployment.id;
    const installationId = payload.installation.id;
    const environmentName = payload.deployment.environment; // Assuming this field is present

    const octokit = await app.getInstallationOctokit(installationId);

    try {
        // Post a status message
        await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule', {
            owner: repoOwner,
            repo: repoName,
            run_id: runId,
            environment_name: environmentName,
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
};