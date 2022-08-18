const axios = require('axios').default;
const url = 'https://chromium.googlesource.com/chromium/src/+log?format=JSON';

(async () => {
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
    console.log(JSON.parse(res.data.slice(firstLineBreak)));
})()
