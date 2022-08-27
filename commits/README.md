## commits

The `commits` scrape the commit logs of Chromium. And post them to PlanetScale.

## run

Specify `.env` file that specifies `DATABASE_URL_ENCODED` as the base64 encoded DATABASE_URL.

The reason why encoded url is used is there are some characters that are not available in environmental variables.

## migration

In a terminal, execute below command to connect planetscale.

```shell
pscale connect chromium-news <branch-name>A --port 3309
```

Then, in another terminal, execute below command.

```shell
npm run migrate
```
