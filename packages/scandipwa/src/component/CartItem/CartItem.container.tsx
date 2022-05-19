/**
 * ScandiPWA - Progressive Web App for Magento
 *
 * Copyright © Scandiweb, Inc. All rights reserved.
 * See LICENSE for license details.
 *
 * @license OSL-3.0 (Open Software License ("OSL") v. 3.0)
 * @package scandipwa/base-theme
 * @link https://github.com/scandipwa/base-theme
 */

import { PureComponent } from 'react';
import { connect } from 'react-redux';

import { ProductType } from 'Component/Product/Product.config';
import SwipeToDelete from 'Component/SwipeToDelete';
import { showNotification } from 'Store/Notification/Notification.action';
import { ReactElement } from 'Type/Common.type';
import { encodeBase64 } from 'Util/Base64';
import { getMaxQuantity, getMinQuantity, getProductInStock } from 'Util/Product/Extract';
import { makeCancelable } from 'Util/Promise';
import { CancelablePromise } from 'Util/Promise/Promise.type';
import { RootState } from 'Util/Store/Store.type';
import { objectToUri } from 'Util/Url';

import CartItem from './CartItem.component';
import { CartItemContainerProps, CartItemContainerState } from './CartItem.type';

export const CartDispatcher = import(
    /* webpackMode: "lazy", webpackChunkName: "dispatchers" */
    'Store/Cart/Cart.dispatcher'
);

/** @namespace Component/CartItem/Container/mapStateToProps */
export const mapStateToProps = (state: RootState) => ({
    isMobile: state.ConfigReducer.device.isMobile,
    cartId: state.CartReducer.cartTotals?.id || ''
});

/** @namespace Component/CartItem/Container/mapDispatchToProps */
export const mapDispatchToProps = (dispatch) => ({
    addProduct: (options) => CartDispatcher.then(
        ({ default: dispatcher }) => dispatcher.addProductToCart(dispatch, options)
    ),
    changeItemQty: (options) => CartDispatcher.then(
        ({ default: dispatcher }) => dispatcher.changeItemQty(dispatch, options)
    ),
    removeProduct: (options) => CartDispatcher.then(
        ({ default: dispatcher }) => dispatcher.removeProductFromCart(dispatch, options)
    ),
    updateCrossSellProducts: (items) => CartDispatcher.then(
        ({ default: dispatcher }) => dispatcher.updateCrossSellProducts(items, dispatch)
    ),
    showNotification: (type, title, error) => dispatch(showNotification(type, title, error))
});

/** @namespace Component/CartItem/Container */
export class CartItemContainer extends PureComponent<CartItemContainerProps, CartItemContainerState> {
    static defaultProps = {
        updateCrossSellsOnRemove: false,
        isCartOverlay: false,
        isEditing: false,
        cartId: '',
        onCartItemLoading: null,
        showLoader: true
    };

    state: CartItemContainerState = { isLoading: false };

    handlers = [];

    containerFunctions = {
        handleChangeQuantity: this.handleChangeQuantity.bind(this),
        handleRemoveItem: this.handleRemoveItem.bind(this),
        getCurrentProduct: this.getCurrentProduct.bind(this),
        getProductVariant: this.getProductVariant.bind(this)
    };

    __construct(props: CartItemContainerProps): void {
        super.__construct?.(props);

        this.setStateNotLoading = this.setStateNotLoading.bind(this);
        this.renderRightSideContent = this.renderRightSideContent.bind(this);
        this.handleRemoveItemOnSwipe = this.handleRemoveItemOnSwipe.bind(this);
    }

    componentDidMount(): void {
        this.setStateNotLoading();
    }

    componentWillUnmount(): void {
        this.notifyAboutLoadingStateChange(false);

        if (this.handlers.length) {
            [].forEach.call(this.handlers, (cancelablePromise: CancelablePromise) => cancelablePromise.cancel());
        }
    }

    productIsInStock(): boolean {
        const { item: { product } } = this.props;

        return getProductInStock(product);
    }

    /**
     * @returns {Product}
     */
    getCurrentProduct() {
        const { item: { product } } = this.props;
        const variantIndex = this._getVariantIndex();

        return variantIndex < 0
            ? product
            : product.variants[ variantIndex ];
    }

    setStateNotLoading(): void {
        this.notifyAboutLoadingStateChange(false);
        this.setState({ isLoading: false });
    }

    containerProps() {
        const {
            item,
            currency_code,
            isEditing,
            isCartOverlay,
            isMobile,
            showLoader
        } = this.props;
        const { isLoading } = this.state;

        return {
            item,
            currency_code,
            isEditing,
            isCartOverlay,
            isMobile,
            isLoading,
            showLoader,
            linkTo: this._getProductLinkTo(),
            thumbnail: this._getProductThumbnail(),
            minSaleQuantity: getMinQuantity(this.getCurrentProduct()),
            maxSaleQuantity: getMaxQuantity(this.getCurrentProduct()),
            isProductInStock: this.productIsInStock(),
            optionsLabels: this.getConfigurableOptionsLabels(),
            isMobileLayout: this.getIsMobileLayout()
        };
    }

    /**
     * Handle item quantity change. Check that value is <1
     * @return {void}
     * @param quantity
     */
    handleChangeQuantity(quantity): void {
        this.setState({ isLoading: true }, () => {
            const { changeItemQty, item: { item_id, qty = 1 }, cartId } = this.props;

            if (quantity === qty) {
                this.setState({ isLoading: false });
                return;
            }

            this.hideLoaderAfterPromise(changeItemQty({
                uid: encodeBase64(item_id),
                quantity,
                cartId
            }));
        });
        this.notifyAboutLoadingStateChange(true);
    }

    /**
     * @return {void}
     */
    handleRemoveItem(e): void {
        this.handleRemoveItemOnSwipe(e);
        this.notifyAboutLoadingStateChange(true);
    }

    handleRemoveItemOnSwipe(e): void {
        if (e) {
            e.preventDefault();
        }

        this.setState({ isLoading: true }, () => {
            this.hideLoaderAfterPromise(this.removeProductAndUpdateCrossSell());
        });
    }

    getIsMobileLayout(): boolean {
        // "isMobileLayout" check is required to render mobile content in some additional cases
        // where screen width exceeds 810px (e.g. CartOverlay)
        const { isMobile, isCartOverlay } = this.props;

        return isMobile || isCartOverlay;
    }

    async removeProductAndUpdateCrossSell() {
        const {
            removeProduct,
            updateCrossSellProducts,
            updateCrossSellsOnRemove,
            item: { item_id }
        } = this.props;

        const result = await removeProduct(item_id);

        if (result && updateCrossSellsOnRemove) {
            await updateCrossSellProducts(result.items);
        }

        return result;
    }

    /**
     * @param {Promise}
     * @returns {cancelablePromise}
     */
    registerCancelablePromise(promise) {
        const cancelablePromise = makeCancelable(promise);
        this.handlers.push(cancelablePromise);

        return cancelablePromise;
    }

    /**
     * @param {Promise} promise
     * @returns {void}
     */
    hideLoaderAfterPromise(promise): void {
        this.registerCancelablePromise(promise)
            .promise.then(this.setStateNotLoading, this.setStateNotLoading);
    }

    getProductVariant() {
        const {
            item: {
                product: {
                    variants = []
                }
            }
        } = this.props;

        return variants[ this._getVariantIndex() ];
    }

    /**
     * @returns {Int}
     */
    _getVariantIndex() {
        const {
            item: {
                sku: itemSku,
                product: { variants = [] } = {}
            }
        } = this.props;

        return variants.findIndex(({ sku }) => sku === itemSku || itemSku.includes(sku));
    }

    /**
     * Get link to product page
     * @param url_key Url to product
     * @return {{pathname: String, state Object}} Pathname and product state
     */
    _getProductLinkTo() {
        const {
            item: {
                product,
                product: {
                    type_id,
                    configurable_options,
                    parent,
                    url
                } = {}
            } = {}
        } = this.props;

        if (type_id !== ProductType.configurable) {
            return {
                pathname: url,
                state: { product }
            };
        }

        const variant = this.getProductVariant();

        if (!variant) {
            return {};
        }
        const { attributes } = variant;

        const parameters = Object.entries(attributes).reduce(
            (parameters, [code, { attribute_value }]) => {
                if (Object.keys(configurable_options).includes(code)) {
                    return { ...parameters, [ code ]: attribute_value };
                }

                return parameters;
            }, {}
        );

        const stateProduct = parent || product;

        return {
            pathname: url,
            state: { product: stateProduct },
            search: objectToUri(parameters)
        };
    }

    _getProductThumbnail(): string {
        const product = this.getCurrentProduct();
        const { thumbnail: { url: thumbnail } = {} } = product;

        return thumbnail || '';
    }

    getConfigurationOptionLabel([key, attribute]): string | null {
        const {
            item: {
                product: {
                    configurable_options = {}
                }
            }
        } = this.props;

        const { attribute_code, attribute_value } = attribute;

        if (!Object.keys(configurable_options).includes(key) || attribute_value === null) {
            return null;
        }

        const {
            [ attribute_code ]: { // configurable option attribute
                attribute_options: {
                    [ attribute_value ]: { // attribute option value label
                        label
                    }
                }
            }
        } = configurable_options;

        return label;
    }

    getConfigurableOptionsLabels() {
        const {
            item: {
                product: {
                    configurable_options,
                    variants
                }
            }
        } = this.props;

        if (!variants || !configurable_options) {
            return [];
        }

        const { attributes = [] } = this.getCurrentProduct() || {};

        return Object.entries(attributes)
            .filter(([attrKey]) => Object.keys(configurable_options).includes(attrKey))
            .map(this.getConfigurationOptionLabel.bind(this))
            .filter((label) => label);
    }

    notifyAboutLoadingStateChange(isLoading): void {
        const { onCartItemLoading } = this.props;

        if (onCartItemLoading) {
            onCartItemLoading(isLoading);
        }
    }

    renderRightSideContent(): ReactElement {
        const { handleRemoveItem } = this.containerFunctions;

        return (
            <button
              block="CartItem"
              elem="SwipeToDeleteRightSide"
              onClick={ handleRemoveItem }
              aria-label={ __('Remove') }
            >
                { __('Delete') }
            </button>
        );
    }

    render(): ReactElement {
        const { isLoading } = this.state;

        return (
            <SwipeToDelete
              renderRightSideContent={ this.renderRightSideContent }
              onAheadOfDragItemRemoveThreshold={ this.handleRemoveItemOnSwipe }
              isLoading={ isLoading }
            >
                <CartItem
                  { ...this.containerFunctions }
                  { ...this.containerProps() }
                />
            </SwipeToDelete>
        );
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(CartItemContainer);