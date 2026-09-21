# VoiSona Talk

Local speech synthesis experiments with the VoiSona Talk REST API.

## Setup

### Enable the REST API

1. Launch VoiSona Talk and sign in to your account.
2. Download at least one voice library you want to use.
3. Generate an API password in your terminal:

   ```sh
   openssl rand -hex 32
   ```

   This generates 32 random bytes (256 bits), encoded as 64 hexadecimal characters.

4. In VoiSona Talk, open **Edit → Preferences → API**.
5. Configure or verify the following settings:
   - Listening port: keep the default, `32766`.
   - Username: the email address used to sign in (cannot be changed).
   - API password: use the generated value, separate from your sign-in password.
6. Check **Enable REST API**.

Keep VoiSona Talk running while making API requests.
To change the port or API password, disable the REST API, update the settings, and enable it again.

### Connection and documentation

These URLs assume you are connecting from the same computer as VoiSona Talk using the default port, `32766`.

- API base URL: `http://localhost:32766/api/talk/v1`
- [Local API reference](http://localhost:32766/docs/talk_api.html)
- [Download the OpenAPI specification (YAML)](http://localhost:32766/docs/talk_api.yaml)
- [Official REST API tutorial](https://manual.voisona.com/en/talk/pc/2b6e9bc7efb18014b922c93fcaa8aac4)

The API uses HTTP Basic authentication with your registered email address and API password.
The local documentation is available while VoiSona Talk is running with the REST API enabled.
The REST API is in beta, so check the local API reference bundled with your installed application version for its specifications.

### Configure the environment

Provide the following environment variables through a `.env` file in this directory:

| Variable | Value |
| --- | --- |
| `VOISONA_API_USERNAME` | Your registered email address |
| `VOISONA_API_KEY` | The API password configured in VoiSona Talk |
| `VOISONA_API_URL` | Optional API base URL; defaults to `http://localhost:32766/api/talk/v1` |

## List voice libraries

Run the command from this directory:

```sh
bun --env-file=.env run voices
```

The command prints the available voice libraries as JSON, including their names, versions, and supported languages. No additional packages are required.
