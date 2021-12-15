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
      const maxTimeInterval = options.maxTimeInterval;
      const ageMidWeight = options.ageMidWeight || 2592000000;
      const tagPrefix = options.tagPrefix || "topic:";

      const isCandidateUrl = url => {
        if (!whitelist && !blacklist) {
          return true;
        } else {
          for (let i = 0; i < blacklist.length; i++) {
            const regex = new RegExp(blacklist[i]);

            if (regex.test(url)) {
              return false;
            }
          }

          for (let j = 0; j < whitelist.length; j++) {
            const regex = new RegExp(whitelist[j]);

            if (regex.test(url)) {
              return true;
            }
          }

          return false;
        }
      };

      const setCategoryOnLocalStorage = url => {
        const candidateCategory = url.split("/")[urlPosition + 1]; // index 0 : empty string

        if (!localStorage.wptags) {
          localStorage.setItem("wptags", JSON.stringify({}));
        }

        // Store viewed categories in the localstorage
        if (isCandidateUrl(url) && candidateCategory) {
          let wpTags = JSON.parse(localStorage.wptags);
          const currentTimestamp = new Date().getTime();

          wpTags[candidateCategory] ? wpTags[candidateCategory].push(currentTimestamp) : (wpTags[candidateCategory] = [currentTimestamp]);

          if (maxViewAge) {
            wpTags[candidateCategory].filter(viewsTimestamp => viewsTimestamp >= maxViewAge);
          }

          // keep the n most recent elements defined by maxViews
          wpTags[candidateCategory].length > maxViews &&
            wpTags[candidateCategory].sort((a, b) => a - b).splice(0, wpTags[candidateCategory].length - maxViews);

          localStorage.wptags = JSON.stringify(wpTags);
        }
      };

      const getFavoriteCategories = () => {
        const ratingCategories = {};
        const wpTags = JSON.parse(localStorage.wptags);
        const categories = Object.keys(wpTags);

        categories.forEach(category => {
          const viewsTimestamp = wpTags[category].sort((a, b) => a - b);

          if (viewsTimestamp.length >= minViews) {
            if (maxTimeInterval) {
              const oldestTimestamp = viewsTimestamp[0];
              const mostRecentTimestamp = viewsTimestamp[viewsTimestamp.length - 1];

              if (mostRecentTimestamp - oldestTimestamp <= maxTimeInterval) {
                let rate = 0;

                // calculate the score of each category
                viewsTimestamp.forEach(timestamp => (rate += Math.exp((-Math.LN2 * (new Date().getTime() - timestamp)) / ageMidWeight)));

                ratingCategories[category] = rate;
              }
            } else {
              let rate = 0;

              // calculate the score of each category
              viewsTimestamp.forEach(timestamp => (rate += Math.exp((-Math.LN2 * (new Date().getTime() - timestamp)) / ageMidWeight)));

              ratingCategories[category] = rate;
            }
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
        const favoriteCategories = getFavoriteCategories();

        const wonderPushTags = await WonderPush.getTags();

        // handle old tags
        wonderPushTags.forEach(async tag => {
          !favoriteCategories.includes(tag.split(tagPrefix)[1]) && (await WonderPush.removeTag(tag));
        });

        // handle new tags
        favoriteCategories.forEach(async category => {
          !wonderPushTags.includes(tagPrefix + category) && (await WonderPush.addTag(tagPrefix + category));
        });
      };

      const handleAutotag = async () => {
        setCategoryOnLocalStorage(window.location.pathname);
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
