/*
 This file is part of web3.js.

 web3.js is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 web3.js is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
 */
/**
 * @file AbstractWeb3Object.js
 * @author Samuel Furter <samuel@ethereum.org>
 * @date 2018
 */

"use strict";

/**
 * @param {any} provider
 * @param {ProvidersPackage} providersPackage
 * @param {MethodController} methodController
 * @param {MethodModelFactory} methodModelFactory
 * @param {BatchRequestPackage} batchRequestPackage
 *
 * @constructor
 */
function AbstractWeb3Object(
    provider,
    providersPackage,
    methodController,
    methodModelFactory,
    batchRequestPackage
) {
    if (!this.isDependencyGiven(provider)) {
        throw Error('Provider not found!');
    }

    if (!this.isDependencyGiven(providersPackage)) {
        throw Error('ProviderPackage not found!');
    }

    this.extendedPackages = [];
    this.providersPackage = providersPackage;
    this.currentProvider = provider;
    this.givenProvider = this.providersPackage.detect();

    this.providers = {
        HttpProvider: this.providersPackage.HttpProvider,
        IpcProvider: this.providersPackage.IpcProvider,
        WebsocketProvider: this.providersPackage.WebsocketProvider,
    };

    var currentProvider = null;

    /**
     * Defines the accessors of currentProvider
     */
    Object.defineProperty(this, 'currentProvider', {
        get: function () {
            return currentProvider;
        },
        set: function (provider) {
            if (typeof currentProvider.clearSubscriptions !== 'undefined' && currentProvider.subscriptions.length > 0) {
                currentProvider.clearSubscriptions();
            }

            currentProvider = this.providersPackage.resolve(provider);
        },
        enumerable: true
    });

    if (this.isDependencyGiven(batchRequestPackage)) {
        this.BatchRequest = function BatchRequest() {
            return batchRequestPackage.createBatchRequest(self.currentProvider);
        };
    }

    if (this.isDependencyGiven(methodModelFactory) && this.isDependencyGiven(methodController)) {
        this.methodModelFactory = methodModelFactory;
        this.methodController = methodController;

        return new Proxy(this,
            {
                get: this.proxyHandler
            }
        )
    }
}

/**
 * Checks if the parameter is defined
 *
 * @method isDependencyGiven
 *
 * @param {*} object
 *
 * @returns {boolean}
 */
AbstractWeb3Object.prototype.isDependencyGiven = function (object) {
    return object !== null || typeof object !== 'undefined';
};

/**
 * Sets the currentProvider and provider property
 *
 * @method setProvider
 *
 * @param {any} provider
 */
AbstractWeb3Object.prototype.setProvider = function (provider) {
    var self = this;

    this.currentProvider = provider;

    if (this.extendedPackages.length > 0) {
        this.extendedPackages.forEach(function(extendedPackage) {
           extendedPackage.setProvider(self.currentProvider)
        });
    }
};

/**
 * Clears all subscriptions and listeners of the provider if it has any subscriptions
 *
 * @method clearSubscriptions
 */
AbstractWeb3Object.prototype.clearSubscriptions = function () {
    if (typeof this.currentProvider.clearSubscriptions !== 'undefined' && this.currentProvider.hasSubscription()) {
        this.currentProvider.clearSubscriptions();
    }
};

/**
 * Extends the current object with JSON-RPC methods
 *
 * @method extend
 *
 * @param {Object} extension
 */
AbstractWeb3Object.prototype.extend = function (extension) {
    var namespace = extension.property || false,
        object;

    if (namespace) {
        object = this[namespace] = new this.constructor(
            this.provider,
            this.providersPackage,
            this.methodController,
            new this.methodModelFactory.constructor(this.methodModelFactory.utils, this.methodModelFactory.formatters)
        );

        this.extendedPackages.push(object);
    } else {
        object = this;
    }

    if (extension.methods) {
        extension.methods.forEach(function (method) {
            function ExtensionMethodModel(utils, formatters) {
                AbstractMethodModel.call(this, method.call, method.params, utils, formatters);
            }

            ExtensionMethodModel.prototype.beforeExecution = function (parameters, web3Package) {
                method.inputFormatters.forEach(function (formatter, key) {
                    if (formatter) {
                        parameters[key] = formatter(parameters[key], web3Package);
                    }
                });
            };

            ExtensionMethodModel.prototype.afterExecution = function (response) {
                if (_.isArray(response)) {
                    response = response.map(function (responseItem) {
                        if (method.outputFormatter && responseItem) {
                            return method.outputFormatter(responseItem);
                        }

                        return responseItem;
                    });

                    return response;
                }

                if (method.outputFormatter && result) {
                    response = method.outputFormatter(response);
                }

                return response;
            };

            ExtensionMethodModel.prototype = Object.create(AbstractMethodModel.prototype);

            object.methodModelFactory.methodModels[method.name] = ExtensionMethodModel;
        });
    }
};

/**
 * Handles method execution
 *
 * @method proxyHandler
 *
 * @param {Object} target
 * @param {String} name
 *
 * @returns {*}
 */
AbstractWeb3Object.prototype.proxyHandler = function (target, name) {
    if (target.methodModelFactory.hasMethodModel(name)) {
        if (typeof target[name] !== 'undefined') {
            throw new Error('Duplicated method ' + name + '. This method is defined as RPC call and as Object method.');
        }

        var methodModel = target.methodModelFactory.createMethodModel(name);

        var anonymousFunction = function () {
            methodModel.methodArguments = arguments;

            return target.methodController.execute(methodModel, target.currentProvider, target.accounts, target);
        };

        anonymousFunction.methodModel = methodModel;
        anonymousFunction.request = methodModel.request;

        return anonymousFunction;
    }

    return target[name];
};


module.exports = AbstractWeb3Object;