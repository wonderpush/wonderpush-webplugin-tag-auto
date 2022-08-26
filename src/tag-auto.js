(function () {
  /**
   * WonderPush E-commerce plugin
   * @class Autotag
   * @param {external:WonderPushPluginSDK} WonderPushSDK - The WonderPush SDK instance provided automatically on intanciation.
   * @param {Autotag.Options} options - The plugin options.
   */
  /**
   * @typedef {Object} Autotag.Options
   * @property {array} [topicList] - An array of strings to search in the URL in order to find topics. When not empty, the urlPosition is ignored.
   * @property {array} [whitelist] - An array of strings. When not empty, the current location URL must match at least one of these strings for the view to be counted.
   * @property {array} [blacklist] - An array of strings. The current location URL must not match any of these strings for the view to be counted.
   * @property {number} [urlPosition] - The number of '/' in the path of the URL preceding the keyword. Use 0 for the hostname. Defaults to 1.
   * @property {number} [numTopics] - Max number of topics. Defaults to 1.
   * @property {number} [minViews] - Minimum number of views for a topic. Defaults to 3, minimum 2.
   * @property {number} [maxViews] - Maximum number of views taken into account for a topic. Leave empty for no maximum, which is the default.
   * @property {number} [maxViewAge] - Number of milliseconds after which the view is not counted anymore. Leave empty for no max age, which is the default.
   * @property {string} [tagPrefix] - The prefix added to tags. Defaults to "topic:".
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("tag-auto", {
    window: function (WonderPushSDK, options) {
      options = options || {};

      // FIXME: don't check me in
      // console.log("autotag installed with options", options);

      const whitelist = options.whitelist || [];
      const blacklist = options.blacklist || [];
      const urlPosition = options.urlPosition || 1;
      const numTopics = options.numTopics || 1;
      const minViews = Math.max(2, options.minViews || 3);
      const maxViews = options.maxViews;
      const maxViewAge = options.maxViewAge;
      const ageMidWeight = options.ageMidWeight || 2592000000;
      const tagPrefix = options.tagPrefix || "topic:";
      const topicList = Array.from(new Set(options.topicList || []));
      const escapeRegExp = (s) => (s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const normalize = (str) => {
        let result = str.normalize ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : str;
        result = result.toLowerCase();
        result = result.replace(/[^a-z0-9]+/g, ' ');
        result = result.trim();
        return result.replace(/\s+/g, '-');
      };
      const regExpFromTopic = (topic) => {
        const escapedTopic = escapeRegExp(normalize(topic));
        // Match escaped topics surrounded by non alphanum characters or nothing
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Assertions#other_assertions
        return new RegExp("(^|[^a-z0-9])" + escapedTopic + "([^a-z0-9]|$)", 'i');
      };
      const topicRegexps = {};
      topicList.forEach(x => topicRegexps[x] = regExpFromTopic(x));

      // FIXME: don't check me in
      // console.log('topicList', topicList)


      const isCandidateUrl = url => {
        if (blacklist.length !== 0) {
          for (let i = 0; i < blacklist.length; i++) {
            const regex = new RegExp(escapeRegExp(blacklist[i]));

            if (regex.test(url)) {
              return false;
            }
          }

          if (whitelist.length === 0) {
            return true;
          }
        }

        if (whitelist.length !== 0) {
          for (let j = 0; j < whitelist.length; j++) {
            const regex = new RegExp(escapeRegExp(whitelist[j]));

            if (regex.test(url)) {
              return true;
            }
          }
          return false;
        }
        return true;
      };

      const extractTopics = async () => {
        const href = window.location.href; // * https://wp.la440.com/2021/12/03/uncategorized/hello-world/
        const hostname = window.location.hostname; // * wp.la440.com
        const pathname = window.location.pathname; // * /2021/12/03/uncategorized/hello-world/


        // FIXME: don't check me in
        // console.log('extractTopics', href, hostname, pathname);

        let candidateTopics = [];
        if (topicList.length > 0) {
          // Page title and URL
          const contentSources = [
            normalize(href),
          ];
          // Title
          const title = normalize(document.title);
          if (title) contentSources.push(title);
            // H1
          const h1 = document.querySelector('h1');
          if (h1 && h1.textContent) contentSources.push(h1.textContent);
          // Opengraph metas
          const metaNames = ['og:title', 'og:description', 'twitter:title', 'twitter:description'];
          if (document.head) {
            metaNames.forEach(metaName => {
              const elt = document.head.querySelector('meta[name="'+metaName+'"]');
              const content = elt ? elt.getAttribute('content') : null;
              const normalized = content ? normalize(content) : null;
              if (normalized) contentSources.push(normalized);
            });
          }

          // FIXME: don't check me in
          // console.log('contentSources', contentSources);

          topicList.forEach(x => {
            const re = topicRegexps[x];
            if (!re) {
              console.warn('Missing regular expression for topic', x);
              return;
            }
            for (const content of contentSources) if (content.match(re)) candidateTopics.push(x);
          });
        } else if (urlPosition === 0) {
          candidateTopics.push(hostname);
        } else {
          const tokens = pathname.split('/');
          while (tokens.length > 0 && !tokens[tokens.length - 1]) {
            tokens.splice(tokens.length - 1, 1);
          }

          // Not allowing the last token
          if (urlPosition < tokens.length - 1) {
            const val = tokens[urlPosition];
            if (!val.match(/^[0-9]+\.html$/) && // Not allowing numeric values followed by .html
              !val.match(/^[0-9]+$/) && // Not allowing numeric values
              val.length <= 50 // Not allowing values larger than 50 chars
            ) {
              candidateTopics.push(val);
            }
          }
        }

        // Dedup
        candidateTopics = Array.from(new Set(candidateTopics));

        // Store viewed topics in the localstorage
        if (isCandidateUrl(href) && candidateTopics.length) {
          let viewsByTopic = {};
          let indexedData = await WonderPushSDK.Storage.get("viewsByTopic");
          if (indexedData.viewsByTopic !== undefined) {
            viewsByTopic = indexedData.viewsByTopic;
          }
          const currentTimestamp = new Date().getTime();
          // iterate
          candidateTopics.forEach((candidateTopic) => {
            // Store the view's timestamp
            if (Object.keys(viewsByTopic).includes(candidateTopic)) {
              viewsByTopic[candidateTopic].push(currentTimestamp);
            } else {
              viewsByTopic[candidateTopic] = [currentTimestamp];
            }

            // Eliminate views that are too old
            if (maxViewAge) {
              viewsByTopic[candidateTopic].filter(viewsTimestamp => viewsTimestamp >= currentTimestamp - maxViewAge);
            }

            // keep the n most recent elements defined by maxViews
            if (viewsByTopic[candidateTopic].length > maxViews) {
              viewsByTopic[candidateTopic].sort((a, b) => a - b).splice(0, viewsByTopic[candidateTopic].length - maxViews);
            }
          });
          // FIXME: don't check me in
          // console.log('viewsByTopic', viewsByTopic, 'candidateTopics', candidateTopics);
          await WonderPushSDK.Storage.set("viewsByTopic", viewsByTopic);
        }
      };

      const getFavoriteTopics = async () => {
        let viewsByTopic = {};
        let indexedData = await WonderPushSDK.Storage.get("viewsByTopic");

        if (indexedData.viewsByTopic !== undefined) {
          viewsByTopic = indexedData.viewsByTopic;
        }

        const ratingTopics = {};
        const topics = Object.keys(viewsByTopic);

        topics.forEach(topic => {
          const viewsTimestamp = viewsByTopic[topic].sort((a, b) => a - b);

          if (viewsTimestamp.length >= minViews) {
            let rate = 0;

            // calculate the score of each topic
            viewsTimestamp.forEach(timestamp => (rate += Math.exp((-Math.LN2 * (new Date().getTime() - timestamp)) / ageMidWeight)));

            ratingTopics[topic] = rate;
          }
        });

        // keep the n favorite topics defined by numTopics
        const favoriteTopics = Object.entries(ratingTopics) // {a: 0, c: 2, b: 1} => [[a, 0], [c, 2], [b, 1]]
          .sort((a, b) => b[1] - a[1]) // => [[c, 2], [b, 1], [a, 0]]
          .map(topic => topic[0]) // => [c, b, a]
          .slice(0, numTopics);

        // FIXME: don't check me in
        // console.log("getFavoriteTopics", favoriteTopics);

        return favoriteTopics;
      };

      const handleWonderPushTags = async () => {
        const favoriteTopics = await getFavoriteTopics();

        const wonderPushTags = await WonderPush.getTags();
        const tagsToAdd = [];
        const tagsToRemove = [];

        // handle old tags
        for (let tag of wonderPushTags) {
          if (tag.startsWith(tagPrefix)) {
            if (!favoriteTopics.includes(tag.substring(tagPrefix.length))) {
              tagsToRemove.push(tag);
            }
          }
        }

        // handle new tags
        favoriteTopics.forEach(topic => {
          if (!wonderPushTags.includes(tagPrefix + topic)) {
            tagsToAdd.push(tagPrefix + topic);
          }
        });

        WonderPush.addRemoveTags(tagsToAdd, tagsToRemove);

        // FIXME: don't check me in
        // console.log('tagsToAdd', tagsToAdd, 'tagsToRemove', tagsToRemove);
      };

      const handleAutotag = async () => {

        // FIXME: don't check me in
        // console.log('handleAutotag');

        await extractTopics();
        await handleWonderPushTags();
      };

      // ! Listen to a new URL
      let url = window.location.href;
      setInterval(() => {
        if (window.location.href === url) return;
        url = window.location.href;
        handleAutotag();
      }, 1000);

      // ! Listen to the end of window loading
      if (window.document.readyState === 'complete') {
        handleAutotag();
      } else {
        window.addEventListener("load", handleAutotag);
      }
    }
  });
})();
