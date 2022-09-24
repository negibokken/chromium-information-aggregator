const axios = require('axios').default;
const parseStringPromise = require('xml2js').parseStringPromise

const url = 'https://www.mail-archive.com/blink-dev@chromium.org/maillist.xml';
const webhookURL = process.env.WEBHOOK_URL;

(async () => {
    try {
        const res = await axios.get(url);
        const data = await parseStringPromise(res.data);
        const items =
            data.rss.channel[0]
                .item
                .filter((i: any) => {
                    return !i.title[0].includes('Re:');
                })
                .map((i: any) => {return `* [${i.title[0]}](${i.link})\n`});

        for (let i = 0; i < items.length; i++) {
            let content = '';
            while (content.length < 1700 && i < items.length) {
                content += items[i];
                i += 1;
            }
            await axios.post(webhookURL, {
                content,
            });
        }


    } catch (e) {
        console.error(e);
    }
})();
