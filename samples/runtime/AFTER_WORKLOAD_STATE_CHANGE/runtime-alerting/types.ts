
export interface WorkloadChangedEvent {
  change_type: string
  workload_changed_object: WorkloadChangedObject
  image_tags_object: ImageTagsObject[]
}

export interface WorkloadChangedObject {
  name: string
  namespace: string
  cluster: string
  nodes: string[]
  risks: string[]
  vulnerabilities_count: number
}

export interface ImageTagsObject {
  name: string
  registry: string
  repository_path: string
  architecture: string
  tag: string
  sha256: string
  risks: string[]
  vulnerabilities?: Vulnerability[]
  malicious_packages: any
  deployed_by: string
  build_info: BuildInfo
}

export interface Vulnerability {
  package_type: string
  xray_id: string
  cve_id: string
  severity: string
  cvss_v2: string
  cvss_v3: string
  last_fetched: string
  issue_kind: number
  applicability: string
  components: Component[]
}

export interface Component {
  component_id: string
  name: string
  version: string
}

export interface BuildInfo {
  build_owner: string
  build_name: string
  build_number: string
  build_repository: string
}
