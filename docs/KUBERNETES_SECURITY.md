# Kubernetes Security Recommendations for SQR

AUDIT2-FIX [L2]: This guide documents the minimum container and cluster controls to apply before running SQR on Kubernetes.

## Security Context

Apply this baseline to all SQR application containers:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault
```

If a writable path is required for uploads or temporary scanner files, mount a dedicated volume instead of making the root filesystem writable.

```yaml
volumeMounts:
  - name: sqr-uploads
    mountPath: /app/uploads
  - name: sqr-tmp
    mountPath: /tmp
volumes:
  - name: sqr-uploads
    persistentVolumeClaim:
      claimName: sqr-uploads
  - name: sqr-tmp
    emptyDir:
      sizeLimit: 512Mi
```

## Network Policies

Restrict ingress and egress to the services SQR actually needs.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sqr-app-network-policy
spec:
  podSelector:
    matchLabels:
      app: sqr
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 5000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
```

Add explicit egress rules for SMTP, object storage, or external AI providers only when those integrations are enabled.

## Secrets And Config

Store runtime secrets in Kubernetes Secrets or an external secret manager. Do not bake secrets into images, ConfigMaps, Helm values committed to git, or deployment manifests.

Required secret-backed values include:

- `SESSION_SECRET`
- `PREVIOUS_SESSION_SECRETS`
- `DATABASE_URL` or PostgreSQL credential fields
- `SQR_REDIS_RATE_LIMIT_URL`
- `TWO_FACTOR_ENCRYPTION_KEY`
- `COLLECTION_PII_ENCRYPTION_KEY`
- `BACKUP_ENCRYPTION_KEY`
- SMTP credentials
- AI provider API keys

Use ConfigMaps only for non-secret values such as feature flags, public origins, sizing knobs, and log levels.

## Resource Limits

Start with conservative limits and tune from production telemetry:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: "1"
    memory: 1Gi
```

For workers handling imports, receipt scanning, or backup restore, set a separate Deployment with larger memory and stricter concurrency limits rather than raising limits for every web pod.

## Health Probes

Use liveness for process health and readiness for dependency-aware serving.

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 5000
  initialDelaySeconds: 20
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 10
```

Readiness must fail when startup checks, PostgreSQL, Redis-backed fail-closed session controls, or scanner dependencies are unavailable.

## Pod Disruption And Rollout

Use rolling updates with at least one ready pod during deployment:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

For production, pair this with:

- `PodDisruptionBudget` requiring at least one available SQR pod.
- `topologySpreadConstraints` across nodes or zones.
- Graceful shutdown long enough to close HTTP and WebSocket sessions.
- Redis-backed rate limiting when replicas or workers exceed one process.

## Container Image Controls

Build images from pinned base images and scan them before deployment.

- Use a non-root user in the Dockerfile.
- Pin Node.js to the supported runtime range from `package.json`.
- Run `npm ci --omit=dev` for production layers.
- Keep source maps out of production images.
- Run dependency audit and SBOM generation in CI.
- Sign images if the registry supports Sigstore, Cosign, or an equivalent control.

## Deployment Checklist

- `runAsNonRoot`, dropped capabilities, and `RuntimeDefault` seccomp are enabled.
- Root filesystem is read-only.
- Upload and temp directories use bounded volumes.
- NetworkPolicy limits ingress and egress.
- Secrets come from a secret manager or Kubernetes Secrets.
- Readiness probes cover PostgreSQL, Redis, and startup health.
- Resource requests and limits are configured.
- Multi-worker or multi-replica deployments use Redis-backed rate limiting.
- Production images contain no `.env` files and no source maps.
