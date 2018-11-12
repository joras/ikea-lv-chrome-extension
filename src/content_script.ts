import * as $ from 'jquery';

function priceSpan(priceTotal, priceDiff) {
	if (priceDiff > 0) {
		return `<span class="prodPrice more">${priceTotal.toFixed(2)} €</span> (${priceDiff.toFixed(2)} € more) `;
	} else if (priceDiff < 0) {
		return `<span class="prodPrice less">${priceTotal.toFixed(2)} €</span> (${Math.abs(priceDiff.toFixed(2))} € Less)`;
	} else {
		return `<span class="prodPrice">${priceTotal.toFixed(2)} €</span>`;
	}
}

function getAndfillPrice(element, product, quantity, origPrice) {
	return fetch(`https://www.ikea.lv/lv/products/item_slidenav?id=${product}&hide%5Bfavourites%5D=true`).then(res => {
		return res.text().then((responseText) => {
			let responseHTML = $.parseHTML(responseText);
			let priceText = $(responseHTML).find('p.itemNormalPrice').text().replace(',', '.').replace('€', '').replace(' ', '');
			let priceTotal = parseFloat(priceText) * quantity;
			let priceDiff = priceTotal - origPrice * quantity;

			element.html(priceSpan(priceTotal, priceDiff));

			return { price: priceTotal, priceDiff: priceDiff }
		})
	});
}

chrome.runtime.sendMessage({}, function (response) {
	var readyStateCheckInterval = setInterval(function () {
		if (document.readyState === "complete") {
			clearInterval(readyStateCheckInterval);

			let productContainer = $('div#productsContainer');

			if (productContainer.length == 0) {
				return;
			}

			let footerRow = $(productContainer).find('#grandTotalFooter tr');
			let latviaTotal = $('<td class="latPrice"><img src="/ms/img/loading.gif" height="10" width="10" /></td>').appendTo(footerRow);

			// add header for Riga prices
			let header = productContainer.find('thead#grandTotalHeader tr');
			header.first().append('<th>Ikea Riga</th>')

			let productRows = $('div#productsContainer tbody tr');


			let prices = [];
			productRows.each((idx, rowElement) => {
				let prodInfo = $(rowElement).find('td.colProduct');

				if (prodInfo.length !== 0) {
					let latviaPrice = $('<td class="latPrice"><img src="/ms/img/loading.gif" height="10" width="10" /></td>').appendTo(rowElement);

					let hiddenName = $(prodInfo).find('input').first();
					let productCodeMatch = /productName_(\d+)/.exec(hiddenName.attr('id'));

					let priceText = $(prodInfo).find('span.prodPrice').text();
					let origPrice = priceText ? parseFloat(priceText.replace(',', '.').replace(' ', '')) : NaN;

					let quantity = parseInt($(rowElement).find('td.colQty input').first().attr('value'));

					if (productCodeMatch && !isNaN(origPrice) && quantity) {
						prices.push(getAndfillPrice(latviaPrice, productCodeMatch[1], quantity, origPrice));
					}
				} else {
					// expand colspan of horizontal line
					let hrzLine = $(rowElement).find('td[colSpan=5]');
					if (hrzLine) {
                        hrzLine.each((idx, elem) => {
							elem.setAttribute('colSpan', "6");
					})};
				}
			});

			Promise.all(prices).then((allPrices) => {
				console.log("ALL PRICES", allPrices);

				let total = allPrices.reduce((prev, curr) => {
					return {
						sumPrice: prev.sumPrice + curr.price,
						sumDiff: prev.sumDiff + curr.priceDiff
					};

				}, { sumPrice: 0, sumDiff: 0 });

				console.log(total);

				latviaTotal.html(priceSpan(total.sumPrice, total.sumDiff));
			});

		}
	}, 10);
});