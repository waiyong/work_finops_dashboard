All claims verified. Here is the full, authoritative answer.

1. Entity Hierarchy
The hierarchy is: Organization → Team → User/Key. An Organization owns many Teams and many Users. A Team owns keys and users but its own parent is always an Organization.

LiteLLM_OrganizationTable
schema.prisma:83-102


model LiteLLM_OrganizationTable {
  organization_id     String   @id @default(uuid())   -- PK, auto-generated UUID
  organization_alias  String                           -- human-readable, user-assigned
  budget_id           String
  metadata            Json     @default("{}")
  models              String[]
  spend               Float    @default(0.0)
  model_spend         Json     @default("{}")
  created_by          String
  updated_by          String
  -- relations:
  teams               LiteLLM_TeamTable[]
  users               LiteLLM_UserTable[]
  keys                LiteLLM_VerificationToken[]
  members             LiteLLM_OrganizationMembership[]
}
LiteLLM_TeamTable
schema.prisma:117-156


model LiteLLM_TeamTable {
  team_id         String  @id @default(uuid())  -- PK, auto-generated UUID
  team_alias      String?                        -- human-readable, user-assigned, optional
  organization_id String?                        -- FK → LiteLLM_OrganizationTable
  ...
  litellm_organization_table LiteLLM_OrganizationTable? @relation(fields: [organization_id], ...)
  @@index([organization_id])
  @@index([team_alias])
}
LiteLLM_UserTable (internal/proxy user)
schema.prisma:233-267


model LiteLLM_UserTable {
  user_id         String  @id                  -- PK, user-assigned or SSO-derived
  user_alias      String?                       -- human-readable, user-assigned
  team_id         String?                       -- FK (soft, not enforced as Prisma relation here)
  organization_id String?                       -- FK → LiteLLM_OrganizationTable
  sso_user_id     String? @unique
  user_email      String?
  user_role       String?
  teams           String[] @default([])         -- list of team_ids user belongs to
  ...
}
LiteLLM_VerificationToken (API key)
schema.prisma:366-425


model LiteLLM_VerificationToken {
  token           String   @id              -- PK, hashed key value
  key_alias       String?                   -- human-readable, user-assigned
  key_name        String?                   -- display name
  user_id         String?                   -- FK (soft) → LiteLLM_UserTable
  team_id         String?                   -- FK (soft) → LiteLLM_TeamTable
  organization_id String?                   -- FK → LiteLLM_OrganizationTable
  ...
  @@index([user_id, team_id])
  @@index([team_id])
}
LiteLLM_EndUserTable (end user)
schema.prisma:519-530


model LiteLLM_EndUserTable {
  user_id String @id        -- PK, caller-supplied (e.g. from request header)
  alias   String?           -- human-readable alias
  spend   Float    @default(0.0)
  blocked Boolean @default(false)
  ...
}
2. Identifier fields and aliases
Entity	Raw ID field	Alias field	Nature
Organization	organization_id	organization_alias	ID: auto-generated UUID; alias: user-assigned, stable
Team	team_id	team_alias	ID: auto-generated UUID; alias: user-assigned, optional
Internal User	user_id	user_alias	ID: user-assigned (often email or SSO sub); alias: user-assigned
API Key	token (hashed)	key_alias	Token: auto-generated hash; alias: user-assigned, optional
End User	user_id	alias	Both caller-supplied (from user field in request)
Note: LiteLLM_VerificationToken also has key_name (a display name separate from key_alias). The token field is stored as a SHA-256 hash of the actual bearer token.

3. Prometheus metric labels
All label definitions live in litellm/types/integrations/prometheus.py as class PrometheusMetricLabels with class UserAPIKeyLabelNames for the string enum values.

litellm_input_tokens_metric / litellm_output_tokens_metric
prometheus.py:414-451

Base labels (both metrics are identical):


end_user          ← LiteLLM_EndUserTable.user_id
hashed_api_key    ← LiteLLM_VerificationToken.token
api_key_alias     ← LiteLLM_VerificationToken.key_alias
model             ← resolved model name (v1 format)
team              ← LiteLLM_TeamTable.team_id
team_alias        ← LiteLLM_TeamTable.team_alias
user              ← LiteLLM_UserTable.user_id
user_email        ← LiteLLM_UserTable.user_email
requested_model   ← model as specified by caller
model_id          ← LiteLLM_ModelTable.id
Dynamically appended by get_labels() at prometheus.py:733-739:


org_id            ← LiteLLM_OrganizationTable.organization_id
org_alias         ← LiteLLM_OrganizationTable.organization_alias
Both org_id and org_alias are emitted on token metrics.

litellm_proxy_total_requests_metric
prometheus.py:310-324


end_user, hashed_api_key, api_key_alias, requested_model,
team, team_alias, user, status_code, user_email,
route, client_ip, user_agent, model_id
+ org_id, org_alias  (dynamically appended — same rule applies)
litellm_deployment_total_requests
prometheus.py:581-593


requested_model
litellm_model_name   (v2 format)
model_id
api_base
api_provider
hashed_api_key
api_key_alias
team
team_alias
client_ip
user_agent
litellm_deployment_total_requests does NOT get org_id/org_alias — it is not in _org_label_metrics (prometheus.py:650-665). End-user and user labels are also absent here; deployment metrics are provider-/model-focused.

_org_label_metrics — the complete set of metrics that get org labels
prometheus.py:650-665


_org_label_metrics: ClassVar[frozenset] = frozenset({
    "litellm_llm_api_latency_metric",
    "litellm_llm_api_time_to_first_token_metric",
    "litellm_request_total_latency_metric",
    "litellm_request_queue_time_seconds",
    "litellm_proxy_total_requests_metric",
    "litellm_proxy_failed_requests_metric",
    "litellm_deployment_latency_per_output_token",
    "litellm_requests_metric",
    "litellm_spend_metric",
    "litellm_input_tokens_metric",
    "litellm_total_tokens_metric",
    "litellm_output_tokens_metric",
})
4. Join path: team_alias → Organization
Yes, the FK exists natively. LiteLLM_TeamTable.organization_id is a proper Prisma foreign key to LiteLLM_OrganizationTable.organization_id (schema.prisma:148) with a supporting index (schema.prisma:153).

The org_id label emitted in Prometheus is LiteLLM_OrganizationTable.organization_id. The org_alias label is LiteLLM_OrganizationTable.organization_alias. Both are available on token and request metrics, so you can group/filter by org directly in PromQL without a secondary lookup.

If you want to resolve team_alias to an org in SQL:


SELECT org.organization_id, org.organization_alias
FROM   "LiteLLM_TeamTable"   t
JOIN   "LiteLLM_OrganizationTable" org ON org.organization_id = t.organization_id
WHERE  t.team_alias = 'aip-gitlab-ci-exempt';
The @@index([team_alias]) and @@index([organization_id]) on LiteLLM_TeamTable make this efficient.

Bottom line: You do not need an external lookup table. If a metric carries org_id/org_alias labels (all token and request counters do), use those directly. For deployment-level metrics that omit org labels, join via team label → LiteLLM_TeamTable.organization_id → LiteLLM_OrganizationTable.