# OpenAgent Amazon Bedrock Provider

Official OpenAgent provider plugin for Amazon Bedrock. It adds Bedrock model discovery, text generation, embeddings, and guardrail-aware provider routing for agents that use AWS-hosted models.

Install from OpenAgent:

```bash
openclaw plugins install @openclaw/amazon-bedrock-provider
```

Configure AWS credentials and region through your normal OpenAgent credential/profile setup, then select Bedrock models with the `amazon-bedrock/...` provider prefix.
