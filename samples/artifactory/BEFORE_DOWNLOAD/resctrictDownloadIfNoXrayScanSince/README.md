# Block download if last Xray scan is older than 30 seconds

This worker will block the download if the artifact has not been scanned by Xray within the last 30 seconds and send a report to an external endpoint. For the example the expiry is quite short, but you may edit the variables EXPIRY and SECONDS to change the expiry duration.

