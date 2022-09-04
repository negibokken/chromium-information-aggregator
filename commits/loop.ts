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

(async () => {
    try {
        let next = 'cc49cc0282091470e9f9bc558bdfc6628d4b9911'
        // 1e2e347f957ef889aaee527bb757849f76e8a808'
        // 401e74376201a9ef1e69aeb6cacf7e9815a3675b';
        // 401e74376201a9ef1e69aeb6cacf7e9815a3675b でErrorが出た

        for (let i = 0; i < 10000; i++) {
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

            const notificationTargets = commits.filter((commit) => {
                return (
                    commit.message.includes('HTTP/3') ||
                    commit.title.includes('HTTP/3'));
            });
            if (notificationTargets.length > 0 && process.env.WEB_HOOK_URL) {
                await axios.post(process.env.WEB_HOOK_URL, {
                    text: `commits`,
                    blocks: notificationTargets.map((commit) => {
                        return {
                            type: 'mrkdwn',
                            text:
                                `<https://chromium.googlesource.com/chromium/src/+/${
                                    commit.commit}|${
                                    commit.commit.slice(
                                        0, 8)}>: ${commit.title}`,
                        };
                    }),
                });
            }

            const query = commits.map((commit) => {
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

            const result = await prismaClient.$transaction([...query]);
            console.log(`${result.length} rows were inserted or updated!`);
            next = data.next;
            console.log('next: ', next);
            await sleep(20);
        }
    } catch (e) {
        console.error(e);
    }
})();
