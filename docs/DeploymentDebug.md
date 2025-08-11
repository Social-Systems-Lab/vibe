# Vibe Cloud Deployment Debugging

This document contains a list of helpful commands for debugging the Vibe Cloud deployment on Kubernetes.

## Connecting to the Cluster

Before you can interact with the cluster, you need to authenticate with Scaleway and configure `kubectl`.

**1. Authenticate with Scaleway:**

```bash
scw init
```

**2. Configure `kubectl`:**

```bash
scw k8s kubeconfig install vibe-kapsule region=fr-par
```

## Viewing Resources

Once you are connected, you can use the following commands to inspect the running resources.

**View `vibe-cloud-api` Deployment and Pods:**

```bash
kubectl get deploy,pods -l app=vibe-cloud-api -n vibe
```

## Viewing Logs

To view the logs from a running pod, use the `kubectl logs` command.

**Get logs from the `vibe-cloud-api` pod:**
_(Replace `pod-name` with the actual name of the pod from the previous command)_

```bash
kubectl logs pod-name -n vibe
```

**Stream logs in real-time:**

```bash
kubectl logs -f pod-name -n vibe
```
