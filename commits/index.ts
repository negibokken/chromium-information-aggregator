import {PrismaClient} from '@prisma/client';

const prismaClient = new PrismaClient();

const axios = require('axios').default;

type Commit = {
    commit: string; title: string; message: string; commitAt: Date;
    authorName: string, authorMail: string;
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


(async () => {
    try {
        let cnt = 0;
        let next = '';
        while (cnt < 15) {
            const url = `https://chromium.googlesource.com/chromium/src/+log${
                next !== '' ? '/' + next : ''}?format=JSON`;
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
            next = data.next

            const commits: Commit[] = data.log.map((log) => {
                const firstLineBreak = log.message.indexOf('\n');
                const title = log.message.slice(0, firstLineBreak);
                const message = log.message.slice(firstLineBreak);
                return {
                    commit: log.commit,
                    title: title,
                    message: message,
                    commitAt: new Date(log.committer.time),
                    authorName: log.author.name,
                    authorMail: log.author.email,
                };
            });

            const lastCommit = await prismaClient.commits.findFirst({
                select: {commit: true},
                orderBy: {commitAt: 'desc'},
            });

            const index = commits.findIndex((commit) => {
                return lastCommit && commit.commit === lastCommit.commit;
            });

            const isLastCommitIncluded = index >= 0;

            let notSavedCommits;
            if (isLastCommitIncluded) {
                notSavedCommits = commits.slice(0, index);
            } else {
                notSavedCommits = commits;
            }

            const notificationTargets =
                notSavedCommits
                    // .filter((commit) => {
                    //     return (
                    //         commit.message.includes('HTTP/3') ||
                    //         commit.title.includes('HTTP/3')
                    //     );
                    // })
                    .map((commit) => {
                        return `* [${
                            commit.commit.slice(
                                0,
                                8)}](https://chromium.googlesource.com/chromium/src/+/${
                            commit.commit}%5E%21/) ${commit.title}`;
                    });
            if (notificationTargets.length > 0 && process.env.WEB_HOOK_URL) {
                let i = 0;
                const n = notificationTargets.length;
                while (i < n) {
                    const start = i;
                    let num = 0;
                    while (num < 1700 && i < n) {
                        num += notificationTargets[i].length;
                        i += 1;
                    }
                    if (num === 0) {
                        break;
                    }
                    const end = i - 1;
                    const content =
                        notificationTargets.slice(start, end).join('\n');
                    try {
                        await axios.post(process.env.WEB_HOOK_URL, {
                            content: content,
                        });
                        await sleep(1);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            console.log(notSavedCommits);

            const queries = notSavedCommits.map((commit) => {
                return prismaClient.commits.upsert({
                    where: {commit: commit.commit},
                    update: {message: commit.message, title: commit.title},
                    create: {
                        commit: commit.commit,
                        title: commit.title,
                        message: commit.message,
                        commitAt: commit.commitAt,
                        authorName: commit.authorName,
                        authorMail: commit.authorMail,
                    },
                });
            });

            function splitQuery(queries: any[], unit: any) {
                const n = queries.length;
                const result = [];
                for (let i = 0; i < n; i += unit) {
                    result.push(queries.slice(i, Math.min(i + unit, n)));
                }
                return result;
            }

            const splitQueries = splitQuery(queries, 10);

            for (const q of splitQueries) {
                const result = await prismaClient.$transaction([...q]);
                console.log(`${result.length} rows were inserted or updated!`);
            }
            if (isLastCommitIncluded) {
                return 0;
            }
            cnt += 1;
        }
    } catch (e) {
        console.error(e);
    }
})();
