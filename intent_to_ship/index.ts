import { PrismaClient } from '@prisma/client';
const axios = require('axios').default;
const parseStringPromise = require('xml2js').parseStringPromise;

const prismaClient = new PrismaClient();

const url = 'https://www.mail-archive.com/blink-dev@chromium.org/maillist.xml';
const webhookURL = process.env.WEBHOOK_URL;

type XMLResponse = {
    rss: {
        channel: Channel[];
    };
};

type Channel = {
    item: Item[];
};

type Item = {
    title: string[];
    link: string[];
    description: string[];
    pubDate: string[];
    guid: {
        _: string;
    }[];
};

class ItemClass {
    title: string;
    link: string;
    description: string;
    pubDate: Date;
    guid: string;
    constructor(item: Item) {
        this.title = item.title[0];
        this.link = item.link[0];
        this.description = item.description[0];
        this.pubDate = new Date(item.pubDate[0]);
        this.guid = item.guid[0]._;
    }

    static create(item: Item): ItemClass {
        return new ItemClass(item);
    }
}

function sleep(sec: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(0), sec * 1000);
    });
}

(async () => {
    try {
        const res = await axios.get(url);
        const data = (await parseStringPromise(res.data)) as XMLResponse;
        const items = data.rss.channel[0].item
            .filter((i: any) => {
                return !i.title[0].includes('Re:');
            })
            .map(ItemClass.create);

        if (process.env.WEBHOOK_URL) {
            for (let i = 0; i < items.length; i++) {
                let content = '';
                while (content.length < 1700 && i < items.length) {
                    const item = items[i];
                    const itemContent = `* [${item.title}](${item.link})\n`;
                    content += itemContent;
                    i += 1;
                }
                await axios.post(webhookURL, {
                    content,
                });
                await sleep(1);
            }
        }

        const queries = items.map((item) => {
            return prismaClient.intents.upsert({
                where: { guid: item.guid },
                update: {
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                },
                create: {
                    guid: item.guid,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
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
    } catch (e) {
        console.error(e);
    }
})();
