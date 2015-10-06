(function () {
'use string'
angular.module('ticTacApp.models', ['awesomeResources'])
    .factory('Board', ['$resource', function ($resource) {
        return $resource({
            url: '/foo/bar' //Not binded to an endpoint yet
        });
    }])
    .factory('Player', ['$resource', function ($resource) {
        return $resource({
            url: '/foo/bar' //Not binded to an endpoint yet
        });
    }]);
}());