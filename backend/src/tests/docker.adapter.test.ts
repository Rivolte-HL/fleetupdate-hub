import test from 'node:test';
import assert from 'node:assert/strict';
import { HostType } from '@prisma/client';
import { DockerAdapter } from '../adapters/docker/docker.adapter.js';

test('DockerAdapter Architecture & Upgrades Tests', async (t) => {
  const adapter = new DockerAdapter();

  await t.test('should expose complete metadata with pruning and timeout configuration', () => {
    const meta = adapter.getMetadata();
    assert.equal(meta.type, HostType.DOCKER);
    assert.equal(meta.displayName, 'Docker Multi-Host Daemon & Proxy');
    assert.ok(meta.supportedActions.includes('checkVersion'));
    assert.ok(meta.supportedActions.includes('applyUpdate'));
    assert.ok(meta.supportedActions.includes('rollback'));
    assert.ok(meta.supportedActions.includes('createBackup'));

    const connFields = meta.connectionFields.map(f => f.name);
    assert.ok(connFields.includes('containerName'));
    assert.ok(connFields.includes('pruneDanglingImages'));
    assert.ok(connFields.includes('healthCheckWaitSeconds'));
    assert.ok(connFields.includes('stopTimeout'));

    const credFields = meta.credentialFields.map(f => f.name);
    assert.ok(credFields.includes('username'));
    assert.ok(credFields.includes('password'));
    assert.ok(credFields.includes('clientCert'));
    assert.ok(credFields.includes('clientKey'));
  });

  await t.test('should correctly extract semantic versions from container labels and environment variables', () => {
    // Access private method extractContainerVersion via type cast
    const extract = (adapter as any).extractContainerVersion.bind(adapter);

    // 1. OCI label extraction
    const v1 = extract('ghcr.io/uptime-kuma/uptime-kuma:latest', 'sha256:1234567890', {
      'org.opencontainers.image.version': '1.23.13'
    });
    assert.equal(v1, '1.23.13');

    // 2. Env variable extraction
    const v2 = extract('grafana/grafana:latest', 'sha256:abcdef123456', {}, [
      'PATH=/usr/local/sbin:/usr/local/bin',
      'GRAFANA_VERSION=10.4.1'
    ]);
    assert.equal(v2, '10.4.1');

    // 3. Image tag extraction (not latest)
    const v3 = extract('portainer/portainer-ce:2.19.4', 'sha256:9988776655', {});
    assert.equal(v3, '2.19.4');

    // 4. Fallback to short SHA digest
    const v4 = extract('nginx:latest', 'sha256:4f8b91a2c3d4e5f6', {});
    assert.equal(v4, 'sha256:4f8b91a');
  });
});
