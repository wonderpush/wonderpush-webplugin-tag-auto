(function () {
  /**
   * WonderPush E-commerce plugin
   * @class Ecommerce
   * @param {external:WonderPushPluginSDK} WonderPushSDK - The WonderPush SDK instance provided automatically on intanciation.
   * @param {Ecommerce.Options} options - The plugin options.
   */
  /**
   * @typedef {Object} Ecommerce.Options
   * @property {string} [thankYouPageUrl] - A pattern contained the URL of your thank-you page, no wildcards. Be careful not to match other pages.
   * @property {string} [addToCartButtonQuerySelector] - A query selector that matches your add-to-cart button(s) with document.querySelectorAll. See https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
   * @property {string} [removeFromCartButtonQuerySelector] - A query selector that matches your remove-from or empty cart button(s) with document.querySelectorAll. See https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("autotag", {
    window: function (WonderPushSDK, options) {
      window.WonderPush = window.WonderPush || [];
      options = options || {};

      console.log("autotag installed with options", options);

      const whitelist = options.whitelist || [];
      const blacklist = options.blacklist || [];
      const urlPosition = options.urlPosition || 0;
      const numFavoriteCategories = options.numFavoriteCategories || 1;
      const minViews = options.minViews;
      const maxViews = options.maxViews;
      const maxViewAge = options.maxViewAge;
      const ageMidWeight = options.ageMidWeight || 2592000000;
      const tagPrefix = options.tagPrefix || "topic:";

      const isCandidateUrl = url => {
        if (blacklist.length === 0 && whitelist.length === 0) {
          return true;
        }

        if (blacklist.length !== 0) {
          for (let i = 0; i < blacklist.length; i++) {
            const regex = new RegExp(blacklist[i]);

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
            const regex = new RegExp(whitelist[j]);

            if (regex.test(url)) {
              return true;
            }
          }
        }

        return false;
      };

      const setCategoryOnLocalStorage = async (href, hostname, pathname) => {
        const candidateCategory = urlPosition === 0 ? hostname : pathname.split("/")[urlPosition + 1]; // index 0 : empty string

        // Store viewed categories in the localstorage
        if (isCandidateUrl(href) && candidateCategory) {
          let viewsByCategory = {};
          let indexedData = await WonderPushSDK.Storage.get("viewsByCategory");

          if (indexedData.viewsByCategory !== undefined) {
            viewsByCategory = indexedData.viewsByCategory;
          }

          const currentTimestamp = new Date().getTime();

          Object.keys(viewsByCategory).includes(candidateCategory)
            ? viewsByCategory[candidateCategory].push(currentTimestamp)
            : (viewsByCategory[candidateCategory] = [currentTimestamp]);

          if (maxViewAge) {
            viewsByCategory[candidateCategory].filter(viewsTimestamp => viewsTimestamp >= currentTimestamp - maxViewAge);
          }

          // keep the n most recent elements defined by maxViews
          viewsByCategory[candidateCategory].length > maxViews &&
            viewsByCategory[candidateCategory].sort((a, b) => a - b).splice(0, viewsByCategory[candidateCategory].length - maxViews);

          await WonderPushSDK.Storage.set("viewsByCategory", viewsByCategory);
        }
      };

      const getFavoriteCategories = async () => {
        let viewsByCategory = {};
        let indexedData = await WonderPushSDK.Storage.get("viewsByCategory");

        if (indexedData.viewsByCategory !== undefined) {
          viewsByCategory = indexedData.viewsByCategory;
        }

        const ratingCategories = {};
        const categories = Object.keys(viewsByCategory);

        categories.forEach(category => {
          const viewsTimestamp = viewsByCategory[category].sort((a, b) => a - b);

          if (viewsTimestamp.length >= minViews) {
            let rate = 0;

            // calculate the score of each category
            viewsTimestamp.forEach(timestamp => (rate += Math.exp((-Math.LN2 * (new Date().getTime() - timestamp)) / ageMidWeight)));

            ratingCategories[category] = rate;
          }
        });

        console.log("ratingCategories :", ratingCategories);

        // keep the n favorite categories defined by numFavoriteCategories
        const favoriteCategories = Object.entries(ratingCategories) // {a: 0, c: 2, b: 1} => [[a, 0], [c, 2], [b, 1]]
          .sort((a, b) => b[1] - a[1]) // => [[c, 2], [b, 1], [a, 0]]
          .map(category => category[0]) // => [c, b, a]
          .slice(0, numFavoriteCategories);

        return favoriteCategories;
      };

      const handleWonderPushTags = async () => {
        const favoriteCategories = await getFavoriteCategories();

        const wonderPushTags = await WonderPush.getTags();

        // handle old tags
        for (let tag of wonderPushTags) {
          if (tag.startsWith(tagPrefix)) {
            !favoriteCategories.includes(tag.substring(tagPrefix.length)) && (await WonderPush.removeTag(tag));
          }
        }

        // handle new tags
        favoriteCategories.forEach(async category => {
          !wonderPushTags.includes(tagPrefix + category) && (await WonderPush.addTag(tagPrefix + category));
        });

        console.log(await WonderPush.getTags());
      };

      const handleAutotag = async () => {
        const href = window.location.href; // * https://wp.la440.com/2021/12/03/uncategorized/hello-world/
        const hostname = window.location.hostname; // * wp.la440.com
        const pathname = window.location.pathname; // * /2021/12/03/uncategorized/hello-world/

        await setCategoryOnLocalStorage(href, hostname, pathname);
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
      window.addEventListener("load", handleAutotag());
    }
  });
})();
