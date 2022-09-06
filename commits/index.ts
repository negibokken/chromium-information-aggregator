import {PrismaClient} from '@prisma/client';

const prismaClient = new PrismaClient();

const axios = require('axios').default;

type Commit = {
    commit: string; title: string; message: string; commitAt: Date;
};

type CommitResponse = {
    log: ChromiumCommit[]; next: string;
};

type CommitHash = string;

type AuthorInfo = {
    name: string; email: string; time: string;
};

type ChromiumCommit = {
    commit: CommitHash; tree: CommitHash; parents: CommitHash[];
    author: AuthorInfo;
    committer: AuthorInfo;
    message: string;
};

function sleep(sec: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(0), sec * 1000);
    });
}


const url = `https://chromium.googlesource.com/chromium/src/+log?format=JSON`;

(async () => {
    try {
        const res = await axios.get(url);
        // HACK: Currently API of googlesource is broken.
        // First line include the below string, and it's not valid JSON.
        //
        // e.g)
        // )]}'
        // {
        //   ...
        // }
        const firstLineBreak = res.data.indexOf('\n');
        const data =
            JSON.parse(res.data.slice(firstLineBreak)) as CommitResponse;

        const commits: Commit[] = data.log.map((log) => {
            const firstLineBreak = log.message.indexOf('\n');
            const title = log.message.slice(0, firstLineBreak);
            const message = log.message.slice(firstLineBreak);
            return {
                commit: log.commit,
                title: title,
                message: message,
                commitAt: new Date(log.committer.time),
            };
        });

        const notificationTargets = commits
            // .filter((commit) => {
            //     return (
            //         commit.message.includes('HTTP/3') ||
            //         commit.title.includes('HTTP/3')
            //     );
            // })
            .map((commit) => {
                return `[${commit.commit.slice(
                    0,
                    8
                )}](https://chromium.googlesource.com/chromium/src/+/${
                    commit.commit
                }) ${commit.title}`;
            });
        console.log('notificationTarget: ', notificationTargets);
        console.log('web_hook_url', !!process.env.WEB_HOOK_URL);
        if (notificationTargets.length > 0 && process.env.WEB_HOOK_URL) {
            await axios.post(process.env.WEB_HOOK_URL, {
                content: `${notificationTargets.join('\n')}`,
            });
        }

        const queries = commits.map((commit) => {
            return prismaClient.commits.upsert({
                where: {
                    commit: commit.commit,
                },
                update: {
                    message: commit.message,
                    title: commit.title,
                },
                create: {
                    commit: commit.commit,
                    title: commit.title,
                    message: commit.message,
                    commitAt: commit.commitAt,
                },
            });
        });

        function splitQuery(queries: any[], unit: any) {
            const n = queries.length;
            const numPerQuery = n / unit;
            const result = [];
            for (let i = 0; i < n; i += numPerQuery) {
                result.push(queries.slice(i, Math.min(i + numPerQuery, n)));
            }
            return result;
        }

        const splitQueries = splitQuery(queries, 10);

        for (const q of splitQueries) {
            const result = await prismaClient.$transaction([...q]);
            console.log(`${result.length} rows were inserted or updated!`);
        }
    } catch (e) {
        console.error(e);
    }
})();
