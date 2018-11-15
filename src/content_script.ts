import * as $ from 'jquery';

function formatPrice(price: number): string {
	if (price === Math.round(price)) {
		return price + '.- €';
	} else {
		return price.toFixed(2) + ' €';
	}
}

function priceSpan(priceTotal: number, priceDiff: number): string {
	if (isNaN(priceDiff)) {
		return `<span class="prodPrice notavail">product not sold</span>`;
	}

	if (priceDiff > 0) {
		return `<span class="prodPrice"> ${formatPrice(priceTotal)}  </span> <span class="prodDiff more"> ▲ ${formatPrice(priceDiff)} </span> `;
	} else if (priceDiff < 0) {
		return `<span class="prodPrice"> ${formatPrice(priceTotal)}  </span> <span class="prodDiff less"> ▼ ${formatPrice(Math.abs(priceDiff))} </span> `;
	} else {
		return `<span class="prodPrice"> ${formatPrice(priceTotal)}  </span> `;
	}
}

function stockQtySpan(stockQty: number, requiredQty: number) {
	if (isNaN(stockQty)) {
		return ''
	};

	if (stockQty == 0) {
		return `<div> <img src='/ms/img/static/stock_check_grey.gif' /> 0 </div>`;
	}

	let stockDiff = stockQty / requiredQty;
	if (stockDiff > 1.3) {
		return `<div><img src='/ms/img/static/stock_check_green.gif' />  ${stockQty} </div>`;
	} else if (stockDiff >= 1) {
		return `<div><img src='/ms/img/static/stock_check_yellow.gif'/>  ${stockQty} </div>`
	} else {
		return `<div> <img src='/ms/img/static/stock_check_red.gif'/>  ${stockQty} </div>`
	}
}


function latviaProductDiv(productInfo: ProductInfo, requiredQty: number, priceDiff: number) {
	return `<div class='productInfo'>
		${priceSpan(productInfo.price * requiredQty, priceDiff)}
		${stockQtySpan(productInfo.stockQty, requiredQty)}
	</div>`;
}

async function getPageHTML(url: string) {
	let response = await fetch(url);
	let text = await response.text();
	return $.parseHTML(text);
}

type ProductInfo = {
	price: number
	code: string
	stockQty: number
}

async function getProductDataFromLatvia(productCode: string): Promise<ProductInfo> {
	let res = {};

	let responseHTML = await getPageHTML(`https://www.ikea.lv/en/products/item_slidenav?id=${productCode}&hide%5Bfavourites%5D=false`);

	if (responseHTML.toString().indexOf('We couldn\'t find any results') > -1) {
		return {
			price: NaN,
			code: productCode,
			stockQty: NaN
		}
	}

	let priceText = $(responseHTML).find('span[data-price]').attr('data-price');
	let itemPrice = parseFloat(priceText);

	let productPageURL = $(responseHTML).find('a.itemName').attr('href');

	let productPageHTML = await getPageHTML('https://www.ikea.lv/' + productPageURL);
	let stockQtyText = $(productPageHTML).find('p.storeLocationLink a').text();
	let stockQty = NaN;

	let stockMatch = (/(\d+)\+? in stock/gm).exec(stockQtyText)
	if (stockMatch) {
		stockQty = parseInt(stockMatch[0]);
	};

	return {
		price: itemPrice,
		code: productCode,
		stockQty: stockQty
	}
}

function extendShoppingList() {
	let productContainer = $('div#productsContainer');

	if (productContainer.length == 0) {
		return;
	}

	let footerRow = $(productContainer).find('#grandTotalFooter tr');
	let latviaTotal = $('<td class="latPrice"><img src="/ms/img/loading.gif" height="10" width="10" /></td>').appendTo(footerRow);

	// add column for Riga prices
	let header = productContainer.find('thead#grandTotalHeader tr');
	header.first().append('<th>Ikea Riga</th>')

	let productInfoResults: Promise<{ priceTotal: number, priceDiff: number }>[] = [];
	$('div#productsContainer tbody tr').each((idx, rowElement) => {
		let prodInfoRow = $(rowElement).find('td.colProduct');

		if (prodInfoRow.length !== 0) {
			let latviaPrice = $('<td class="latPrice"><img src="/ms/img/loading.gif" height="10" width="10" /></td>').appendTo(rowElement);

			// get product code
			let hiddenName = $(prodInfoRow).find('input').first();
			let productCodeMatch = /productName_(\d+)/.exec(hiddenName.attr('id'));

			// parse original price
			let priceText = $(prodInfoRow).find('span.prodPrice').text();
			let origPrice = priceText ? parseFloat(priceText.replace(',', '.').replace(' ', '')) : NaN;

			// parse original quantity
			let requiredQty = parseInt($(rowElement).find('td.colQty input').first().attr('value'));

			if (productCodeMatch && !isNaN(origPrice) && requiredQty) {

				let getProductInfo = getProductDataFromLatvia(productCodeMatch[0]);

				productInfoResults.push(getProductInfo.then((productInfo) => {
					let priceTotal = productInfo.price * requiredQty;
					let priceDiff = priceTotal - origPrice * requiredQty;

					latviaPrice.html(latviaProductDiv(productInfo, requiredQty, priceDiff));

					return { priceTotal, priceDiff }
				}));
			}
		} else {
			// there are special table rows for creating horizontal lines, extend those by one column

			let hrzLine = $(rowElement).find('td[colSpan=5]');
			if (hrzLine) {
				hrzLine.each((idx, elem) => {
					elem.setAttribute('colSpan', "6");
				})
			};
		}
	});

	// wait for all product information to be fetched, fill the total
	Promise.all(productInfoResults).then((allPrices) => {
		let total = allPrices.reduce((prev, curr) => {
			return {
				sumPrice: prev.sumPrice + curr.priceTotal,
				sumDiff: prev.sumDiff + curr.priceDiff
			};

		}, { sumPrice: 0, sumDiff: 0 });

		if (isNaN(total.sumPrice)) {
			latviaTotal.html('<span>some products not sold</span>');
		} else {
			latviaTotal.html(priceSpan(total.sumPrice, total.sumDiff));
		}
	});
}



// run the extension
chrome.runtime.sendMessage({}, function (response) {
	var readyStateCheckInterval = setInterval(function () {
		if (document.readyState === "complete") {
			clearInterval(readyStateCheckInterval);

			extendShoppingList();
		}
	}, 10);
});