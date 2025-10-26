import { Pool } from 'pg'
import { generateEd25519KeyPair, didFromEd25519 } from 'vibe-core'
import { instanceIdFromDid } from '../lib/did'
import { randomBytes, createHash } from 'crypto'
import { encryptWithMasterKey, decryptWithMasterKey } from '../lib/crypto'

type PostgresConfig = {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  instanceIdSecret: string
}

export class IdentityService {
  private pool: Pool
  private instanceIdSecret: string
  public isConnected = false

  constructor(cfg: PostgresConfig) {
    const connectionString = cfg.connectionString || process.env.PG_CONNECTION_STRING || undefined
    this.pool = new Pool(
      connectionString
        ? { connectionString }
        : {
            host: cfg.host || process.env.PGHOST,
            port: cfg.port ? Number(cfg.port) : (process.env.PGPORT ? Number(process.env.PGPORT) : 5432),
            database: cfg.database || process.env.PGDATABASE,
            user: cfg.user || process.env.PGUSER,
            password: cfg.password || process.env.PGPASSWORD,
          }
    )
    this.instanceIdSecret = cfg.instanceIdSecret
  }

  async onApplicationBootstrap() {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          did                text PRIMARY KEY,
          email              text UNIQUE NOT NULL,
          password_hash      text NOT NULL,
          display_name       text,
          instance_id        text NOT NULL,
          public_key         text NOT NULL,
          encrypted_private_key text NOT NULL,
          key_enc_version    int  NOT NULL
        );
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          did        text NOT NULL,
          hash       text PRIMARY KEY,
          expires_at timestamptz NOT NULL
        );
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS reset_tokens (
          did        text NOT NULL,
          hash       text PRIMARY KEY,
          expires_at timestamptz NOT NULL
        );
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_consents (
          did        text NOT NULL,
          client_id  text NOT NULL,
          origin     text NOT NULL,
          scopes     text[] NULL,
          manifest   jsonb NOT NULL DEFAULT '{}'::jsonb,
          added_at   timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (did, client_id)
        );
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS auth_codes (
          code            text PRIMARY KEY,
          user_did        text NOT NULL,
          client_id       text NOT NULL,
          scope           text,
          redirect_uri    text NOT NULL,
          code_challenge  text NOT NULL,
          code_method     text NOT NULL,
          expires_at      timestamptz NOT NULL,
          created_at      timestamptz NOT NULL DEFAULT now()
        );
      `)
      await client.query('COMMIT')
      this.isConnected = true
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  private async reauthenticate() {
    // no-op for pooled Postgres
  }

  async register(email: string, password_hash: string, _password_raw: string, displayName: string) {
    await this.reauthenticate()
    const keyPair = generateEd25519KeyPair()
    const did = didFromEd25519(keyPair.publicKey)
    const instanceId = instanceIdFromDid(did, this.instanceIdSecret)

    const encryptedPrivateKey = encryptWithMasterKey(Buffer.from(keyPair.privateKey).toString('hex'))
    const publicKeyHex = Buffer.from(keyPair.publicKey).toString('hex')

    const refreshToken = randomBytes(32).toString('hex')
    const hashedRefreshToken = createHash('sha256').update(refreshToken).digest('hex')
    const expires = new Date()
    expires.setDate(expires.getDate() + 30)

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO users(did, email, password_hash, display_name, instance_id, public_key, encrypted_private_key, key_enc_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [did, email, password_hash, displayName, instanceId, publicKeyHex, encryptedPrivateKey, 2]
      )
      await client.query(
        `INSERT INTO refresh_tokens(did, hash, expires_at) VALUES ($1,$2,$3)`,
        [did, hashedRefreshToken, expires]
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    // Auto-consent for cloud UI (manifest handling done at higher level if needed)
    // Caller may store additional consent after registration
    return {
      did,
      email,
      password_hash,
      displayName,
      instanceId,
      publicKey: publicKeyHex,
      encryptedPrivateKey,
      keyEncVersion: 2,
      refreshToken,
    }
  }

  async findByEmail(email: string) {
    await this.reauthenticate()
    const { rows } = await this.pool.query(
      `SELECT did, email, password_hash, display_name as displayName, instance_id as instanceId, public_key as publicKey, encrypted_private_key as encryptedPrivateKey, key_enc_version as keyEncVersion
       FROM users WHERE email=$1`,
      [email]
    )
    return rows[0] || null
  }

  async login(email: string, password_raw: string) {
    const user = await this.findByEmail(email)
    if (!user) throw new Error('Invalid credentials')
    const isMatch = await Bun.password.verify(password_raw, user.password_hash)
    if (!isMatch) throw new Error('Invalid credentials')

    const refreshToken = randomBytes(32).toString('hex')
    const hashedRefreshToken = createHash('sha256').update(refreshToken).digest('hex')
    const expires = new Date()
    expires.setDate(expires.getDate() + 30)
    await this.pool.query(
      `INSERT INTO refresh_tokens(did, hash, expires_at) VALUES ($1,$2,$3)`,
      [user.did, hashedRefreshToken, expires]
    )
    return { ...user, refreshToken }
  }

  async findByDid(did: string) {
    await this.reauthenticate()
    const { rows } = await this.pool.query(
      `SELECT did, email, password_hash, display_name as displayName, instance_id as instanceId, public_key as publicKey, encrypted_private_key as encryptedPrivateKey, key_enc_version as keyEncVersion
       FROM users WHERE did=$1`,
      [did]
    )
    return rows[0] || null
  }

  async findUserByResetToken(resetToken: string) {
    const hashed = createHash('sha256').update(resetToken).digest('hex')
    const { rows } = await this.pool.query(
      `SELECT u.did, u.email, u.password_hash, u.display_name as displayName, u.instance_id as instanceId, u.public_key as publicKey, u.encrypted_private_key as encryptedPrivateKey, u.key_enc_version as keyEncVersion, r.expires_at
       FROM reset_tokens r JOIN users u ON u.did = r.did WHERE r.hash=$1`,
      [hashed]
    )
    const row = rows[0]
    if (!row) return null
    if (new Date(row.expires_at) < new Date()) return null
    return row
  }

  async findUserByRefreshToken(refreshToken: string) {
    const hashed = createHash('sha256').update(refreshToken).digest('hex')
    const { rows } = await this.pool.query(
      `SELECT u.did, u.email, u.password_hash, u.display_name as displayName, u.instance_id as instanceId, u.public_key as publicKey, u.encrypted_private_key as encryptedPrivateKey, u.key_enc_version as keyEncVersion
       FROM refresh_tokens t JOIN users u ON u.did = t.did WHERE t.hash=$1`,
      [hashed]
    )
    return rows[0] || null
  }

  async validateRefreshToken(refreshToken: string) {
    const user = await this.findUserByRefreshToken(refreshToken)
    if (!user) throw new Error('Invalid refresh token')
    const oldHash = createHash('sha256').update(refreshToken).digest('hex')
    const newRefreshToken = randomBytes(32).toString('hex')
    const newHash = createHash('sha256').update(newRefreshToken).digest('hex')
    const exp = new Date()
    exp.setDate(exp.getDate() + 30)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM refresh_tokens WHERE hash=$1`, [oldHash])
      await client.query(`INSERT INTO refresh_tokens(did, hash, expires_at) VALUES ($1,$2,$3)`, [user.did, newHash, exp])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
    return { ...user, refreshToken: newRefreshToken }
  }

  async logout(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex')
    await this.pool.query(`DELETE FROM refresh_tokens WHERE hash=$1`, [hash])
  }

  async createAuthCode(data: {
    userDid: string
    clientId: string
    redirectUri: string
    codeChallenge: string
    codeChallengeMethod: string
    scope: string
  }): Promise<string> {
    const code = randomBytes(32).toString('hex')
    const expires = new Date()
    expires.setMinutes(expires.getMinutes() + 1)
    await this.pool.query(
      `INSERT INTO auth_codes(code, user_did, client_id, scope, redirect_uri, code_challenge, code_method, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [code, data.userDid, data.clientId, data.scope, data.redirectUri, data.codeChallenge, data.codeChallengeMethod, expires]
    )
    return code
  }

  async validateAuthCode(code: string, codeVerifier: string, clientId: string, redirectUri: string): Promise<string> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(`SELECT * FROM auth_codes WHERE code=$1`, [code])
      if (!rows[0]) throw new Error('Invalid or expired authorization code.')
      const rec = rows[0]
      await client.query(`DELETE FROM auth_codes WHERE code=$1`, [code])
      await client.query('COMMIT')

      if (new Date(rec.expires_at) < new Date()) throw new Error('Invalid or expired authorization code.')
      if (rec.client_id !== clientId) throw new Error('Client ID does not match.')
      if (rec.redirect_uri !== redirectUri) throw new Error('Redirect URI does not match.')
      // Same-origin check
      const clientUrl = new URL(rec.client_id)
      const redirectUrl = new URL(rec.redirect_uri)
      if (!redirectUrl.href.startsWith(clientUrl.origin)) {
        throw new Error('Redirect URI must be on the same domain as client ID.')
      }

      // PKCE
      if (rec.code_method === 'S256') {
        const hashedVerifier = createHash('sha256').update(codeVerifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        if (rec.code_challenge !== hashedVerifier) throw new Error('Invalid code_verifier.')
      } else {
        if (rec.code_challenge !== codeVerifier) throw new Error('Invalid code_verifier.')
      }

      // Optional: validate scopes format (omitted; follows existing behavior)
      return rec.user_did as string
    } catch (e) {
      try { await client.query('ROLLBACK') } catch {}
      throw e
    } finally {
      client.release()
    }
  }

  async storeUserConsent(
    userDid: string,
    consent: { clientId: string; origin: string; scopes?: string[]; manifest: any; addedAt?: string }
  ) {
    const addedAt = consent.addedAt ? new Date(consent.addedAt) : new Date()
    await this.pool.query(
      `INSERT INTO user_consents(did, client_id, origin, scopes, manifest, added_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (did, client_id) DO UPDATE SET origin=EXCLUDED.origin, scopes=EXCLUDED.scopes, manifest=EXCLUDED.manifest`,
      [userDid, consent.clientId, consent.origin, consent.scopes ?? null, consent.manifest ?? {}, addedAt]
    )
  }

  async hasUserConsented(userDid: string, clientIdOrOrigin: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM user_consents WHERE did=$1 AND (client_id=$2 OR origin=$2) LIMIT 1`,
      [userDid, clientIdOrOrigin]
    )
    return !!rows[0]
  }

  async revokeUserConsent(userDid: string, clientIdOrOrigin: string) {
    await this.pool.query(
      `DELETE FROM user_consents WHERE did=$1 AND (client_id=$2 OR origin=$2)`,
      [userDid, clientIdOrOrigin]
    )
  }

  async getDecryptedPrivateKey(user: any): Promise<string> {
    if (user.keyEncVersion !== 2) throw new Error('Cannot decrypt private key for unmigrated user')
    return decryptWithMasterKey(user.encryptedPrivateKey)
  }

  async updateUser(did: string, data: { displayName?: string; pictureUrl?: string; password_hash?: string }) {
    const fields: string[] = []
    const values: any[] = []
    let idx = 1
    if (data.displayName !== undefined) { fields.push(`display_name = $${idx++}`); values.push(data.displayName) }
    if (data.password_hash !== undefined) { fields.push(`password_hash = $${idx++}`); values.push(data.password_hash) }
    if (fields.length === 0) {
      const { rows } = await this.pool.query(`SELECT did, email, password_hash, display_name as displayName, instance_id as instanceId, public_key as publicKey, encrypted_private_key as encryptedPrivateKey, key_enc_version as keyEncVersion FROM users WHERE did=$1`, [did])
      return rows[0]
    }
    values.push(did)
    await this.pool.query(`UPDATE users SET ${fields.join(', ')} WHERE did = $${idx}`, values)
    const { rows } = await this.pool.query(
      `SELECT did, email, password_hash, display_name as displayName, instance_id as instanceId, public_key as publicKey, encrypted_private_key as encryptedPrivateKey, key_enc_version as keyEncVersion FROM users WHERE did=$1`,
      [did]
    )
    return rows[0]
  }

  async listUserConsents(userDid: string): Promise<Array<{ clientId: string; origin: string; scopes?: string[]; manifest: any; addedAt: string }>> {
    const { rows } = await this.pool.query(
      `SELECT client_id, origin, scopes, manifest, added_at FROM user_consents WHERE did=$1 ORDER BY added_at DESC`,
      [userDid]
    )
    return rows.map((r) => ({ clientId: r.client_id, origin: r.origin, scopes: r.scopes ?? undefined, manifest: r.manifest ?? {}, addedAt: (r.added_at as Date).toISOString() }))
  }

  async createDbSession(_user: any) {
    // Not applicable for Postgres-backed flow; return placeholders to keep legacy endpoint functional
    return { username: '', password: '' }
  }
}

