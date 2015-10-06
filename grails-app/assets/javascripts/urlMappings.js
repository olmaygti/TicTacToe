(function (ticTacModule) {
    "use strict";

    ticTacModule.config(['$stateProvider', '$urlRouterProvider',
        function ($stateProvider, $urlRouterProvider) {
            $stateProvider
                .state('home', {
                    url: '/home',
                    templateUrl: 'templates/home.html',
                    controller: 'MainCtrl'
                })
            $urlRouterProvider.when('', '/home');
            $urlRouterProvider.otherwise('', '/home');
        }
    ]);
}(angular.module('ticTacApp')));