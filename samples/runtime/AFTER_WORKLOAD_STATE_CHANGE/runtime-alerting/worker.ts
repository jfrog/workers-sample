import { PlatformContext } from 'jfrog-workers';
import { WorkloadChangedEvent } from './types';

export default async (
  context: PlatformContext,
  data: WorkloadChangedEvent
): Promise<{ message: string }> => {
  // Configuration options
  const elasticReporting: boolean = false; // Set to true to enable Elasticsearch reporting
  
  // Retrieving secrets
  const slackWebhookUrl = (context.secrets as any).get('Slack_URL'); // Slack channel webhook URL
  let elasticApiKey: string | undefined = undefined;
  let elasticUrl: string | undefined = undefined;
  
  if (elasticReporting) {
    elasticApiKey = (context.secrets as any).get('Elastic_API_Key'); // Elasticsearch API KEY
    elasticUrl = (context.secrets as any).get('Elastic_URL'); // Elasticsearch URL
  }
  const elasticIndex = "runtime_leap"; // Elasticsearch index name

  // Optional alert conditions
  const alertSeverity: string | undefined = undefined;
  const alertCveID: string | undefined = undefined;
  const alertNamespace: string | undefined = undefined;

  const alertBlocks: any[] = [];

  const pushAlertBlock = (text: string) => {
    alertBlocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text
        }
      },
      { type: "divider" }
    );
    console.log(`${text}`)
  };

  try {
    console.log(`Worker is connected to cluster ${data.workload_changed_object.cluster}`);
    
    let shouldAlert = false;
    let bulkData: string[] = []; // Array to store the bulk lines

    data.image_tags_object.forEach((imageTag) => {
      // Ensure vulnerabilities is always an array
      let vulnerabilities = Array.isArray(imageTag.vulnerabilities) ? imageTag.vulnerabilities.map((vuln) => {
        return {
          CVEid: vuln.cve_id,
          xray_id: vuln.xray_id,
          severity: vuln.severity,
          cvss_v2: vuln.cvss_v2,
          cvss_v3: vuln.cvss_v3,
          package_type: vuln.package_type,
          last_fetched: vuln.last_fetched,
          issue_kind: vuln.issue_kind,
          applicability: vuln.applicability,
          components: vuln.components
        };
      }) : [];

      vulnerabilities.forEach((vuln) => {
        const stat = {
          CVEid: vuln.CVEid,
          xray_id: vuln.xray_id,
          severity: vuln.severity,
          cvss_v2: vuln.cvss_v2,
          cvss_v3: vuln.cvss_v3,
          package_type: vuln.package_type,
          last_fetched: vuln.last_fetched,
          issue_kind: vuln.issue_kind,
          applicability: vuln.applicability,
          components: vuln.components,
          imageName: imageTag.name,
          imageTag: imageTag.tag,
          imageRegistry: imageTag.registry,
          imageRepositoryPath: imageTag.repository_path,
          imageArchitecture: imageTag.architecture,
          imageSha256: imageTag.sha256,
          deployedBy: imageTag.deployed_by,
          buildInfo: imageTag.build_info,
          cluster: data.workload_changed_object.cluster,
          name: data.workload_changed_object.name,
          namespace: data.workload_changed_object.namespace,
          nodes: data.workload_changed_object.nodes,
          workloadRisks: data.workload_changed_object.risks,
          vulnerabilitiesCount: data.workload_changed_object.vulnerabilities_count,
          timestamp: new Date().toISOString(),
          vulnerabilities: vulnerabilities
        };

        if (elasticReporting) {
          bulkData.push(
            JSON.stringify({ index: { _index: elasticIndex } }), 
            JSON.stringify(stat)
          );
        }

        if (
          (alertSeverity && vuln.severity === alertSeverity) || 
          (alertCveID && vuln.CVEid === alertCveID) || 
          (alertNamespace && new RegExp(alertNamespace).test(data.workload_changed_object.namespace))
        ) {
          shouldAlert = true;
        }
      });

      // Alert if risks are present
      if (imageTag.risks && imageTag.risks.length > 0) {
        shouldAlert = true;
        pushAlertBlock(`⚠️ *Risk Alert!*\n*Workload Details:*\n• *Name:* ${data.workload_changed_object.name}\n• *Namespace:* ${data.workload_changed_object.namespace}\n• *Cluster:* ${data.workload_changed_object.cluster}\n• *Nodes:* ${data.workload_changed_object.nodes.join(", ")}\n• *Workload Risks:* ${data.workload_changed_object.risks.join(", ")}\n• *Vulnerabilities Count:* ${data.workload_changed_object.vulnerabilities_count}\n*Image Details:*\n• *📦 Name:* ${imageTag.name}\n• *🏷️ Tag:* ${imageTag.tag}\n• *🏛️ Registry:* ${imageTag.registry}\n• *📁 Repository:* ${imageTag.repository_path}\n• *🏗️ Architecture:* ${imageTag.architecture}\n• *🔗 SHA256:* ${imageTag.sha256.substring(0, 12)}...\n• *👤 Deployed by:* ${imageTag.deployed_by}\n• *🏗️ Build:* ${imageTag.build_info.build_name} #${imageTag.build_info.build_number}\n• *⚠️ Image Risks:* ${imageTag.risks.join(", ")}`);
      }
    });

    if (elasticReporting && elasticUrl && elasticApiKey) {
      const indexCheck = await context.clients.axios.get(`${elasticUrl}/${elasticIndex}`, {
        headers: {
          'Authorization': `ApiKey ${elasticApiKey}`
        }
      });
      console.log(`Elasticsearch index check: ${indexCheck.status}`);

      if (bulkData.length > 0) {
        const bulkRequest = bulkData.join("\n") + "\n";
        console.log("Sending Bulk data to Elasticsearch...");
        const elastic_bulk = await context.clients.axios.post(`${elasticUrl}/_bulk`, bulkRequest, {
          headers: {
            'Authorization': `ApiKey ${elasticApiKey}`,
            'Content-Type': 'application/x-ndjson'
          }
        });
        console.log(`Data successfully sent to Elasticsearch with status ${elastic_bulk.status}`);
      }
    } else if (elasticReporting) {
      console.warn("Elasticsearch reporting is enabled but URL or API key is missing. No data sent.");
    } else {
      console.log("Elasticsearch reporting is disabled. Skipping data indexing.");
    }

    if (slackWebhookUrl) {
      if (!shouldAlert) {
        pushAlertBlock("✅ No issues detected in the image scan.");
      }
      
      try {
        console.log("Sending alert to Slack...");
        const slackResponse = await context.clients.axios.post(slackWebhookUrl, {
          blocks: alertBlocks,
        });
        console.log(`Slack response status: ${slackResponse.status}`);
      } catch (slackError) {
        console.error(
          `Failed to send alert to Slack. Status: ${slackError.response?.status || "<none>"} - ${slackError.message}`
        );
      }
    } else {
      console.warn('Slack webhook URL is not set. No alert sent.');
    }

    console.log("Successfully processed information");
  } catch (error) {
    console.error(
      `Request failed with status code ${error.response?.status || "<none>"} caused by: ${error.message}`
    );
  }

  return { message: "proceed" };
};