/**
 * @license AngularJS v1.2.9
 * (c) 2010-2014 Google, Inc. http://angularjs.org
 * License: MIT
 */
(function(window, angular, undefined) {'use strict';

var $resourceMinErr = angular.$$minErr('$resource');

// Helper functions and regex to lookup a dotted path on an object
// stopping at undefined/null.  The path must be composed of ASCII
// identifiers (just like $parse)
var MEMBER_NAME_REGEX = /^(\.[a-zA-Z_$][0-9a-zA-Z_$]*)+$/;

function isValidDottedPath(path) {
    return (path != null && path !== '' && path !== 'hasOwnProperty' &&
            MEMBER_NAME_REGEX.test('.' + path));
}

function lookupDottedPath(obj, path) {
    if (!isValidDottedPath(path)) {
        throw $resourceMinErr('badmember', 'Dotted member path "@{0}" is invalid.', path);
    }
    var keys = path.split('.');
    for (var i = 0, ii = keys.length; i < ii && obj !== undefined; i++) {
        var key = keys[i];
        obj = (obj !== null) ? obj[key] : undefined;
    }
    return obj;
}

/**
 * Create a shallow copy of an object and clear other fields from the destination
 */
function shallowClearAndCopy(src, dst) {
    dst = dst || {};

    angular.forEach(dst, function(value, key){
        delete dst[key];
    });

    for (var key in src) {
        if (src.hasOwnProperty(key) && key.charAt(0) !== '$' && key.charAt(1) !== '$') {
            dst[key] = src[key];
        }
    }

    return dst;
}

angular.module('awesomeResources', ['ng']).
    factory('$resource', ['$http', '$q', '$injector', function($http, $q, $injector) {

        var DEFAULT_ACTIONS = {
                'get':    {method:'GET'},
                'save':   {method:'POST'},
                'update': {method:'PUT'},
                'updateOrDie': {method:'PUT'},
                'query':  {method:'GET', isArray:true},
                'remove': {method:'DELETE'},
                'delete': {method:'DELETE'}
            },
            noop = angular.noop,
            forEach = angular.forEach,
            extend = angular.extend,
            copy = angular.copy,
            isFunction = angular.isFunction,
            nullyValue = function (value) {
                return (value === undefined || value === null || (typeof value === 'string' && value.length === 0))
            };

        var watcherProps = {
            enumerable: false,
            configurable: true,
            writable: false,
            value: function (prop, handler) {
                var oldval = this[prop],
                    newval = oldval,
                    getter = function () {
                            return newval;
                    },
                    setter = function (val) {
                            oldval = newval;
                            newval = handler.call(this, prop, oldval, val);
                            return newval;
                    };

                if (delete this[prop]) { // can't watch constants
                    Object.defineProperty(this, prop, {
                            get: getter,
                            set: setter,
                            enumerable: true,
                            configurable: true
                    });
                }
            }
        };

        var defaultValidators = {
            maxLength : function (field, constraint, errorMsg) {
                // If no field is provided return true, we have a notnull validator
                var valid = field ? (field.length <= constraint) : true;
                return valid || errorMsg || 'validation.maxLength';
            },
            minLength : function (field, constraint, errorMsg) {
                // If no field is provided return true, we have a notnull validator
                var valid = field ? (field.length >= constraint) : true;
                return valid || errorMsg || 'validation.minLength';
            },
            notNull: function (field, errorMsg) {
                return !nullyValue(field) || errorMsg || 'validation.notNull';
            },
            integer: function (field, errorMsg) {
                var isInteger = typeof field === "number" && isFinite(field) &&  Math.floor(field) === field;
                return isInteger || defaultValidators.matches(field,  /^(\-|\+)?\d+$/ , errorMsg || 'validation.integer');
            },
            positiveInteger: function (field, errorMsg) {
                var integerValue = (/^(\+)?\d+$/.test(field) && parseInt(field, 10));
                return nullyValue(field)
                    || (integerValue && integerValue > 0)
                    || errorMsg || 'validation.positiveInteger';
            },
            url: function(field, errorMsg) {
                var urlRegExp = /^((https?:\/\/)?|(www.))([[\da-z\][\da-z.\-]+)\.([a-z\.]{2,6})([\/\w \.-?]*)*\/?$/;
                return defaultValidators.matches(field,  urlRegExp , errorMsg || 'validation.url');
            },
            greaterThan : function (field, constraint, errorMsg) {
                var isNumber = defaultValidators.integer(field);
                if (isNumber === true && field) {
                    return parseInt(field, 10) > constraint  || errorMsg || 'validation.greaterThan';
                } 
                return isNumber;
            },
            lessThan : function (field, constraint, errorMsg) {
               var isNumber = defaultValidators.integer(field);
                if (isNumber === true && field) {
                    return parseInt(field, 10) < constraint  || errorMsg || 'validation.lessThan';
                } 
                return isNumber;
            },
            inBetween: function(field, constraintA, constraintB, errorMsg) {
              var less = defaultValidators.lessThan(field, constraintB, errorMsg);
              if (less === true && field) {
                return parseInt(field, 10) > constraintA  || errorMsg || 'validation.greaterThan';
              }
              return less;
            },
            noSpace: function (field, errorMsg) {
                return nullyValue(field) || (typeof field === 'string' && !/.*\s.*/.test(field)) || errorMsg || 'validation.noSpaces';
            },
            matches: function(field, constraints, errorMsg) {
                var valid = field === null|| field === undefined
                    || ((typeof field === 'string') && (field.length === 0 || constraints.test(field))) ;

                return valid || errorMsg || 'validation.matches';
            },
            // Validates the given property again this.$property list. The this context is the Resource
            // instance so a valid classProperties: { property: [list]} had to be defined to use this validator
            'in': function (field, classPropName, errorMsg) {
                return _.contains(this.$static[classPropName], field) || errorMsg || 'validation.invalidType';
            }
        }

        /**
         * We need our custom method because encodeURIComponent is too aggressive and doesn't follow
         * http://www.ietf.org/rfc/rfc3986.txt with regards to the character set (pchar) allowed in path
         * segments:
         *    segment       = *pchar
         *    pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
         *    pct-encoded   = "%" HEXDIG HEXDIG
         *    unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
         *    sub-delims    = "!" / "$" / "&" / "'" / "(" / ")"
         *                     / "*" / "+" / "," / ";" / "="
         */
        function encodeUriSegment(val) {
            return encodeUriQuery(val, true).
                replace(/%26/gi, '&').
                replace(/%3D/gi, '=').
                replace(/%2B/gi, '+');
        }


        /**
         * This method is intended for encoding *key* or *value* parts of query component. We need a
         * custom method because encodeURIComponent is too aggressive and encodes stuff that doesn't
         * have to be encoded per http://tools.ietf.org/html/rfc3986:
         *    query       = *( pchar / "/" / "?" )
         *    pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
         *    unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
         *    pct-encoded   = "%" HEXDIG HEXDIG
         *    sub-delims    = "!" / "$" / "&" / "'" / "(" / ")"
         *                     / "*" / "+" / "," / ";" / "="
         */
        function encodeUriQuery(val, pctEncodeSpaces) {
            return encodeURIComponent(val).
                replace(/%40/gi, '@').
                replace(/%3A/gi, ':').
                replace(/%24/g, '$').
                replace(/%2C/gi, ',').
                replace(/%20/g, (pctEncodeSpaces ? '%20' : '+'));
        }

        function Route(template, keepTrailingSlashes) {
            this.template = template;
            this.urlParams = {};
            this.defaults = {};
            this.keepTrailingSlashes = !!keepTrailingSlashes;
        }

        Route.prototype = {
            setUrlParams: function(config, params, actionUrl) {
                var self = this,
                        url = actionUrl || self.template,
                        val,
                        encodedVal;

                var urlParams = self.urlParams = {};
                forEach(url.split(/\W/), function(param){
                    if (param === 'hasOwnProperty') {
                        throw $resourceMinErr('badname', "hasOwnProperty is not a valid parameter name.");
                    }
                    if (!(new RegExp("^\\d+$").test(param)) && param &&
                             (new RegExp("(^|[^\\\\]):" + param + "(\\W|$)").test(url))) {
                        urlParams[param] = true;
                    }
                });
                url = url.replace(/\\:/g, ':');

                params = params || {};
                forEach(self.urlParams, function(_, urlParam){
                    val = params.hasOwnProperty(urlParam) ? params[urlParam] : self.defaults[urlParam];
                    if (angular.isDefined(val) && val !== null) {
                        encodedVal = encodeUriSegment(val);
                        url = url.replace(new RegExp(":" + urlParam + "(\\W|$)", "g"),function(match, p1) {
                            return encodedVal + p1;
                        });
                    } else {
                        url = url.replace(new RegExp("(\/?):" + urlParam + "(\\W|$)", "g"), function(match,
                                leadingSlashes, tail) {
                            if (tail.charAt(0) == '/') {
                                return tail;
                            } else {
                                return leadingSlashes + tail;
                            }
                        });
                    }
                });

                if (!self.keepTrailingSlashes) {
                    // strip trailing slashes and set the url
                    url = url.replace(/\/+$/, '') || '/';
                }
                // then replace collapse `/.` if found in the last URL path segment before the query
                // E.g. `http://url.com/id./format?q=x` becomes `http://url.com/id.format?q=x`
                url = url.replace(/\/\.(?=\w+($|\?))/, '.');
                // replace escaped `/\.` with `/.`
                config.url = url.replace(/\/\\\./, '/.');


                // set params - delegate param encoding to $http
                forEach(params, function(value, key){
                    if (!self.urlParams[key]) {
                        config.params = config.params || {};
                        config.params[key] = value;
                    }
                });
            }
        };


        function resourceFactory(config) { //url, paramDefaults, actions, extraConfig) {
            if (typeof config === 'string') { // backwards compatibility w/ older versions of models
                config = arguments.length > 3
                    ? _.assign(arguments[3], {url: config})
                    : {url: config};

                config.paramDefaults = arguments.length > 1 ? arguments[1] : undefined;
                config.actions = arguments.length > 2 ? arguments[2] : undefined;
            }

            var route = new Route(config.url, config.keepTrailingSlashes),
                url = config.url,
                paramDefaults = config.paramDefaults,
                actions = config.actions,
                initFunction = config.init || noop,
                preInitFunction = config.preInit || noop,
                arrayKeys = config.arrayKeys,
                fields = config.fields,
                objectWrappingKey = config.objectWrappingKey,
                resourceDumper = config.resourceDumper,
                validators = fields && _.transform(fields, function (map, conf, fieldname) {
                    if (_(conf).has('validators')) {
                        map[fieldname] = conf.validators;
                    }
                }, {}),
                observers = config.observers && _.mapValues(config.observers, function (obs) {
                    return obs instanceof Array ? obs : [obs];
                }),
                classProperties = config.classProperties,
                headers = config.headers,
                cache = config.cache;

            config.methods && angular.extend(Resource.prototype, config.methods);

            if (!_(arrayKeys).isUndefined()) {
                angular.extend(Resource.prototype, {arrayKeys: arrayKeys});
            }

             //TODO: injecting constructors of other resources in Fields

            actions = extend({}, DEFAULT_ACTIONS, actions);

            function extractParams(data, actionParams){
                var ids = {};
                actionParams = extend({}, paramDefaults, actionParams);
                forEach(actionParams, function(value, key){
                    if (isFunction(value)) { value = value(); }
                    ids[key] = value && value.charAt && value.charAt(0) == '@' ?
                        lookupDottedPath(data, value.substr(1)) : value;
                });
                return ids;
            }

            function storeItem (item) {
                return cache && cache.store(item) || item;
            }


            function initializeResource(self, resource, value) {
                // resource can be a pointer to the resource function (unlikely but cool feature)
                resource = typeof resource === 'function' && !resource.prototype.$isDirty
                    ? resource.call(self)
                    : resource;

                // or a string pointing to the service name
                resource = typeof resource === 'string' ? $injector.get(resource) : resource;

                if (resource && !(value instanceof resource)) {
                    value = new resource(value);
                }

                return value;
            }


            function unwrapArray(field, fieldValue) {
                if (!(fieldValue instanceof Array) && field.resource) {
                    var template = initializeResource(self, field.resource, {});
                    if (template.arrayKeys) {
                        var arrayKey = !_(template.arrayKeys).isObject() ? template.arrayKeys : undefined;
                        if (_(arrayKey).isUndefined()) {
                            arrayKey = template.arrayKeys[name] || template.arrayKeys['default'];
                        }
                        fieldValue = lookupDottedPath(fieldValue, arrayKey);
                    }
                    // Not and array and not Resource type defined; we did what we could
                    // but this is definitely not valid 1-n relationship mapping :)
                    else {
                        fieldValue = undefined;
                    }
                }

                return fieldValue || [];
            }

            // Performs a quick initialization for a given field based on parameters provided
            function initializeField(self, fieldValue, fieldName) {
                var field = fields[fieldName];
                if (_.isUndefined(field) || _.isUndefined(fieldValue)) {
                    return undefined;
                }

                if (field.isArray) {
                    fieldValue = unwrapArray(field, fieldValue);

                    forEach(fieldValue, function (element, index) {
                        if (isFunction(field.loader)) {
                            fieldValue[index] = element = field.loader.apply(self, [element]);
                        }

                        fieldValue[index] = initializeResource(self, field.resource, element);
                    });

                    // TODO: Still have to implement watching the collection for changes: $rootScope.$watchCollection

                } else {
                    if (isFunction(field.loader)) {
                        fieldValue = field.loader.apply(self, [fieldValue]);
                    }

                    fieldValue = initializeResource(self, field.resource, fieldValue);
                }

                return fieldValue;
            }

            // this context is bound to the resource instance
            function validateField(validator, value) {
                if (validator instanceof Function) {
                    return validator.call(this, value);
                }
                // Built-in validators
                else if (_(validator).isObject()) {
                    var validatorName = _.keys(validator)[0],
                        validatorArgs = angular.copy(validator[validatorName]),
                        func = defaultValidators[validatorName];
                    if (_(func).isUndefined()) {
                        throw new Error('Unkown validator');
                    } else {
                        if (!(validatorArgs instanceof Array)) {
                            validatorArgs = [validatorArgs]
                        }
                        validatorArgs.unshift(value);
                        return func.apply(this, validatorArgs);
                    }
                } else if (typeof validator === 'string') {
                    var func = defaultValidators[validator];
                    if (_(func).isUndefined()) {
                        throw new Error('Unkown validator');
                    } else {
                        return func(value);
                    }
                }
            }

            function validateResource(self, validators) {
                var resourceErrors = {};

                self.$valid = true;
                _(validators).each(function (fieldValidators, fieldName) {
                    var fieldErrors = [];
                    _(fieldValidators).each(function (validator) {
                        var result = validateField.call(self, validator, self[fieldName]);
                        if (!(result === true)) {
                            fieldErrors.push(result);
                        }
                    });
                    if (!_(fieldErrors).isEmpty()) {
                        resourceErrors[fieldName] = fieldErrors;
                    }
                });

                if (!_(resourceErrors).isEmpty()) {
                    self.$valid = false;
                    self.$errors = resourceErrors;
                } else {
                    delete self.$errors;
                }

                return self.$valid;
            }

            function lookForDirtyChildren(self) {
                forEach(fields, function (fieldDefinition, fieldName) {
                    if (_(fieldDefinition).isObject()
                            && 'resource' in fieldDefinition
                            && fieldDefinition.dirtiesParent) {


                        if (fieldDefinition.isArray) {
                            var arrayErrors = []
                            _(self[fieldName]).each(function (resource) {
                                var dirtyProps = resource.$dirty;
                                if (!_(dirtyProps).isUndefined()) {
                                    arrayErrors.push(dirtyProps);
                                }
                            });

                            if (!_(arrayErrors).isEmpty()) {
                                self.$dirty = self.$dirty || {};
                                self.$dirty[fieldName] = arrayErrors;
                            }
                        } else {
                            var dirtyProps = self[fieldName].$dirty;
                            if (!_(dirtyProps).isUndefined()) {
                                self.$dirty = self.$dirty || {};
                                self.$dirty[fieldName] = dirtyProps;
                            }
                        }
                    }
                });
                return !_(self.$dirty).isUndefined();
            }

            function cleanChildren(self) {
                forEach(fields, function (fieldDefinition, fieldName) {
                    if (_(fieldDefinition).isObject()
                            && 'resource' in fieldDefinition
                            && fieldDefinition.dirtiesParent) {

                        _([self[fieldName]]).flatten().each(function (resource) {
                            if (resource.$isDirty()) {
                                resource.$clean();
                            }
                        });
                        delete self.$dirty[fieldName];
                    }
                });
            }

            function defaultResponseInterceptor(response) {
                return response.resource;
            }

            function notifyObservers(self, eventName, data) {
                if (observers || self.$$instanceObservers) {
                    var classLevelObservers = observers &&  observers[eventName] || [],
                        instanceObservers = self.$$instanceObservers && self.$$instanceObservers[eventName] || [];

                    classLevelObservers.concat(instanceObservers).forEach(function (obs) {
                        obs.apply(self, [data]);
                    });
                }
            }

            function buildContext (url, urlParams, totalCount) {
                var offset = urlParams.offset || 0,
                    maxResults = urlParams.maxResults || 10,
                    nextOffset = offset + maxResults,
                    previouseOffset = offset - maxResults,
                    context = {
                        offset: offset,
                        maxResults: maxResults,
                        totalCount: totalCount
                    };

                if (nextOffset < totalCount) {
                    context.next = url + '?' +
                        _(urlParams).omit(['maxResults', 'offset'])
                            .extend({maxResults: maxResults, offset: nextOffset})
                            .pairs()
                            .map(function (keyValue) {
                                return keyValue.join('=');
                            }).value().join('&');
                }

                if (previouseOffset >= 0) {
                    context.previous = url + '?' +
                        _(urlParams).omit(['maxResults', 'offset'])
                            .extend({maxResults: maxResults, offset: previouseOffset})
                            .pairs()
                            .map(function (keyValue) {
                                return keyValue.join('=');
                            }).value().join('&');
                }

                return context;
            }

            function Resource(value){
                var self = this;

                if (objectWrappingKey && objectWrappingKey in value) {
                    value = value[objectWrappingKey];
                }

                shallowClearAndCopy(value || {}, this);

                preInitFunction.apply(self);


                if (fields) {
                    // if fields is defined then try to instantiate and use the definition for s
                    // each field defined for the resource will be watched to define dirty
                    // fields and instantiate them properly
                    forEach(fields, function (field, fieldName) {
                        self[fieldName] = initializeField(self, self[fieldName], fieldName);

                        if (field.watchNested && self[fieldName]) {
                            Object.defineProperty(self[fieldName], "$watch", watcherProps);
                            for(var nestedKey in self[fieldName]) {
                                self[fieldName].$watch(nestedKey, function (prop, oldValue, newValue) {
                                    if (oldValue !== newValue) {
                                        self.$dirty = self.$dirty || {};
                                        if (!(fieldName in self.$dirty)) {
                                            self.$dirty[fieldName] = shallowClearAndCopy(self[fieldName]);
                                        }
                                    }
                                    return newValue;
                                });
                            }
                        }
                        // creating watchers to all the fields to keep track of changes in any of them
                        self.$watch(fieldName, function (prop, oldValue, newValue) {
                                newValue = initializeField(self, newValue, prop);
                                if (oldValue !== newValue && !fields[fieldName].avoidDump) {
                                        self.$dirty = self.$dirty || {};
                                        // Edge case, $dirty[prop] can be null when
                                        // the field has no initial value
                                        if (!(prop in self.$dirty)) {
                                            self.$dirty[prop] = oldValue;
                                        }
                                }
                                return newValue;
                        });
                    });
                }
                initFunction.apply(self);
            }

            Resource.$fields = fields;

            if (classProperties) {
                Resource.prototype.$static = {};
                for (var prop in classProperties) {
                    Resource['$' + prop] = classProperties[prop];
                    Resource.prototype.$static['$' + prop] = classProperties[prop];
                }
            }

            extend(Resource.prototype, {
                $isDirty: function () {
                    return lookForDirtyChildren(this) || this.$dirty !== undefined;
                },
                // method to prepare info to send to server. If data is provided we use those
                // fields as reference to prepare data to send. We do so because in some parts
                // of the resource it may be checking if there are dirty fields.
                $dumpData: function (data, action, params) {
                    var self = this;

                    data = data || this;
                    if (data === undefined) { return data; }

                    var dumpedData = {};
                    if (fields) {
                        forEach(fields, function (field, fieldName) {
                            var fieldValue = data[fieldName];
                            if (field.avoidDump || _.isUndefined(fieldValue)) {
                                return;
                            }
                            if (field.resource) {
                                dumpedData[fieldName] = !field.isArray
                                    ? fieldValue.$dumpData()
                                    : _.map(fieldValue, function (res) { return res.$dumpData()});
                            } else {
                                dumpedData[fieldName] = isFunction(field.dumper)
                                    ? field.dumper.apply(self, [fieldValue, fieldName])
                                    : fieldValue;
                            }
                        });
                    } else {
                        dumpedData = data;
                    }

                    // Per action defined dumpers will always overwrite global defined ones
                    if (action && action.dumper && typeof action.dumper === 'function') {
                        dumpedData = action.dumper.apply(self, [dumpedData, params]);
                    } else if (resourceDumper && typeof resourceDumper === 'function') {
                        dumpedData = resourceDumper.apply(self, [dumpedData, params]);
                    }
                    return _.pick(dumpedData, function (value, key) {
                        return key.charAt(0) !== '$';
                    });
                },
                $pristine: function () {
                    return _.extend(shallowClearAndCopy(this),  this.$isDirty() ? this.$dirty : {});
                },
                // Cleaning all
                $clean: function() {
                    var self = this;

                    cleanChildren(self);

                    if (self.$isDirty()) {
                        _(self.$dirty).keys().each(function (key) {
                            self[key] = self.$dirty[key];
                        });
                        delete self.$dirty;
                    }
                    self.$validate();
                },
                $validate: function() {
                    return validateResource(this, validators);
                },
                $getResourceUri: function () {
                    var obj = {};
                    route.setUrlParams(obj, this)
                    return obj.url;
                },
                $addObserver: function (eventName, observer) {
                    this.$$instanceObservers = this.$$instanceObservers || {};
                    this.$$instanceObservers[eventName] =  this.$$instanceObservers[eventName] || [];
                    this.$$instanceObservers[eventName].push(observer);
                }
            });

            if (cache) {
                Resource.getFromCache = function (key) {
                    return cache.getByKey(key);
                }

                // TODO: Should come soon
                // Resource.getFromCacheOrFetch = function (key) {
                //     var cached = cache.getByKey(key);
                //     var notCached = Resource.get(key);
                //     return notCached;
                // }
            }

            forEach(actions, function(action, name) {
                var hasBody = /^(POST|PUT|PATCH)$/i.test(action.method),
                    next, previous;

                Resource[name] = function(a1, a2, a3, a4) {
                    var params = {}, data, success, error;

                    /* jshint -W086 */ /* (purposefully fall through case statements) */
                    switch(arguments.length) {
                    case 4:
                        error = a4;
                        success = a3;
                        //fallthrough
                    case 3:
                    case 2:
                        if (isFunction(a2)) {
                            if (isFunction(a1)) {
                                success = a1;
                                error = a2;
                                break;
                            }

                            success = a2;
                            error = a3;
                            //fallthrough
                        } else {
                            params = a1;
                            data = a2;
                            success = a3;
                            break;
                        }
                    case 1:
                        if (isFunction(a1)) success = a1;
                        else if (hasBody) data = a1;
                        else params = a1;
                        break;
                    case 0: break;
                    default:
                        throw $resourceMinErr('badargs',
                            "Expected up to 4 arguments [params, data, success, error], got {0} arguments",
                            arguments.length);
                    }
                    /* jshint +W086 */ /* (purposefully fall through case statements) */

                    var promise,
                        isInstanceCall = this instanceof Resource,
                        value = isInstanceCall ? data : (action.isArray ? [] : {}),
                        httpConfig = {},
                        beforeEventName = 'before' + name.charAt(0).toUpperCase() + name.substring(1),
                        afterEventName = 'after' + name.charAt(0).toUpperCase() + name.substring(1),
                        operationFinishedPromise,

                        responseInterceptor = action.interceptor
                            && action.interceptor.response
                            || defaultResponseInterceptor,

                        responseErrorInterceptor = action.interceptor
                            && action.interceptor.responseError
                            || undefined;

                    forEach(action, function(value, key) {
                        if (key != 'params' && key != 'isArray' && key != 'interceptor') {
                            httpConfig[key] = copy(value);
                        }
                    });

                    // Not sending invalid data to the server!!!
                    if (isInstanceCall && hasBody && !value.$validate()) {
                        throw new Error('Trying to save an invalid instance');
                    }

                    // Notify the before event listener, if supplied
                    notifyObservers(value, beforeEventName, data);

                    // dumping data on request in case necessary based on dumpers defined in $field
                    httpConfig.data = hasBody && Resource.prototype.$dumpData.apply(this, [data, action, params]) || undefined;

                    if (!_(headers).isUndefined()) {
                        httpConfig.headers = httpConfig.headers || {};
                        extend(httpConfig.headers, headers);
                    }

                    if (params && params.pagination_url) { // getNext or getPrevious call
                        httpConfig.url = params.pagination_url;
                    } else {
                        route.setUrlParams(httpConfig,
                                extend({}, extractParams(data, action.params || {}), params),
                                action.url);
                    }

                    // If $update is called on a Resource instance and nothing has changed we save an HTTP request
                    if (isInstanceCall && name === 'update' && !value.$isDirty()) {
                        var deferred = $q.defer()
                        promise = deferred.promise;
                        // Resolving with an empty object, promise process will just pass through and value will be returned
                        deferred.resolve({});
                    } else {
                        promise = $http(httpConfig);
                    }

                    return promise.then(function(response) {
                        var data = response.data,
                            promise = value.$promise,
                            context;

                        if (data && angular.isObject(data)) {
                            // Need to convert action.isArray to boolean in case it is undefined
                            // jshint -W018
                            if ('context' in data && 'items' in data) {
                                context = data.context;
                                data = data.items;
                            } else if ('totalCount' in data) {
                                // We only admit two keys in the response, one has to be 'totalCount' and we do
                                // not care about the other one, we will return its contents
                                var responseKeys = _.keys(data);
                                responseKeys.splice(responseKeys.indexOf("totalCount"), 1);
                                if (responseKeys.length === 1) {
                                    // If there are not params either on the received object or the url
                                    // this is the result of a request that didn't ask for pagination
                                    // We have the full list of objects, no need to build the context
                                    if (httpConfig.params || httpConfig.url.indexOf('?') != -1) {
                                        // If httConfig.params is empty that means the url will contain the query parameters
                                        // from the just executed request (this is already a result of a queryNext() call)
                                        var url = httpConfig.params ? httpConfig.url : httpConfig.url.split('?')[0],
                                            // Pick query parameters, split them into an array of strings
                                            // extract each key/value duple, create the urlParams object with that data
                                            urlParams = httpConfig.params ||_.transform(
                                                httpConfig.url.split('?')[1].split('&'),
                                                function (memo, stringifiedQueryParam) {
                                                    var keyValuePair = stringifiedQueryParam.split('=');
                                                    memo[keyValuePair[0]] = /^\d+$/.test(keyValuePair[1]) ? parseInt(keyValuePair[1], 10) : keyValuePair[1];
                                                }, {}
                                            );

                                        context = buildContext(url, urlParams, data.totalCount);
                                    }
                                    data = data[responseKeys[0]];

                                } else {
                                    throw new Error('Wrong pagination response received from the server');
                                }
                            }
                            if (angular.isArray(data) !== (!!action.isArray)) {
                                // Allowing array actions to return objects if an arrayKeys key is specified in the Resource configuration
                                // arrayKeys should either be a string containing the path to get the collection on the returned data
                                // or an object which keys contain custom actions names mapped to the specific path to gather the collection.
                                if (action.isArray && !_(arrayKeys).isUndefined()) {
                                    var arrayKey = !_(arrayKeys).isObject() ? arrayKeys : undefined;
                                    if (_(arrayKey).isUndefined()) {
                                        arrayKey = arrayKeys[name] || arrayKeys['default'];
                                    }
                                    data = lookupDottedPath(data, arrayKey);
                                } else {
                                    throw $resourceMinErr('badcfg', 'Error in resource configuration. Expected ' +
                                        'response to contain an {0} but got an {1}',
                                        action.isArray?'array':'object', angular.isArray(data)?'array':'object');
                                }
                            }
                            // jshint +W018
                            if (action.isArray) {
                                value.length = 0;
                                forEach(data, function(item) {
                                    value.push(storeItem(new Resource(item)));
                                });
                            } else {
                                // Using extend instead of shllowClearAndCopy so we activate the watchers
                                value = value instanceof Resource
                                    ? extend(value, data)
                                    : new Resource(data);

                                storeItem(value);
                                //TOOD: FIX DOUBLE INITIALIZATION OF RESOURCES!
                                initFunction.apply(value);
                                if (value instanceof Resource) {
                                    preInitFunction.apply(value);
                                }
                                value.$promise = promise;
                            }
                        }

                        delete value.$dirty;

                        value.$resolved = true;

                        (success||noop)(value, response.headers);

                        if (!data && response.status === 201 && response.headers()['location']) {
                            var observers = value.$$instanceObservers || {};
                            // "New" instace will have all the instance-dlevel-defined observed1
                            operationFinishedPromise = value = Resource.get({url: response.headers()['location']}).then(function (res) {
                                extend(res, {$$instanceObservers: observers});
                                return res;
                            });
                        } else {
                            operationFinishedPromise = $q.when(value);
                        }

                        return operationFinishedPromise.then(function (data) {
                            // Notify the after event listener, if supplied
                            _(action.isArray && data || [data]).each(function (resource) {
                                notifyObservers(data, afterEventName);
                            });

                            if (context) {
                                return {
                                    context: context,
                                    resource: value
                                };
                            } else {
                                return value
                            }
                        });
                    }, function(response) {
                        value.$resolved = true;

                        (error||noop)(response);

                        return $q.reject(response);
                    });
                };


                Resource.prototype['$' + name] = function(params, success, error) {
                    if (isFunction(params)) {
                        error = success; success = params; params = {};
                    }
                    var result = Resource[name].call(this, params, this, success, error);
                    return result.$promise || result;
                };

                // Binding queryNext and queryPrevious methods for pagination
                if (action.method === 'GET' && action.isArray) {
                    next = name + "Next";
                    previous = name + "Previous";
                    Resource[next] = function (context, success, error) {
                        context = context || {};
                        var nextUrl = context.next;
                        if (nextUrl) {
                            return Resource[name]({pagination_url: nextUrl}, success, error);
                        }
                        return null;
                    };
                    Resource[previous] = function (context, success, error) {
                        var previousUrl = context.previous;
                        if (previousUrl) {
                            return Resource[name]({pagination_url: previousUrl}, success, error);
                        }
                        return null;
                    };
                }
            });

            Resource.bind = function(additionalParamDefaults){
                return resourceFactory(url, extend({}, paramDefaults, additionalParamDefaults), actions);
            };

            Object.defineProperty(Resource.prototype, "$watch", watcherProps);

            return Resource;
        }

        return resourceFactory;
    }]);


})(window, window.angular);
