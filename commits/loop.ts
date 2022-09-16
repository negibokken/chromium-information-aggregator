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
        let next = ''

        for (let i = 0; i < 100000; i++) {
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
                    authorName: log.author.name,
                    authorMail: log.author.email,
                };
            });

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
                        authorName: commit.authorName,
                        authorMail: commit.authorMail,
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
