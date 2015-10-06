(function () {
    "use strict";
    angular.module('ticTacApp', [
        'ui.router',
        'ticTacApp.models',
        'pubnub.angular.service'
    ]).
    controller('MainCtrl', [
        '$rootScope',
        '$scope',
        'Player',
        'Board',
        'PubNub',
        function ($rootScope, $scope, Player, Board, PubNub) {
        var ctx, board;

        function init () {
            $scope.ctx = ctx = {};
            PubNub.init({
              publish_key:'pub-c-852e309f-7075-44d3-8fef-e839f5d862e3',
              subscribe_key:'sub-c-d40d23c8-013c-11e4-bf30-02ee2ddab7fe'
            });
            PubNub.ngSubscribe({ channel: 'ticTac' });
            PubNub.ngSubscribe({ channel: 'ticTacHandshake' });
            $rootScope.$on(PubNub.ngMsgEv('ticTac'), function(event, payload) {
                $scope.$apply(function () {
                    movementHandler(payload.message);
                });
            });
            $rootScope.$on(PubNub.ngMsgEv('ticTacHandshake'), function(event, payload) {
                if (ctx.players && ctx.players[0].name !== payload.message.name) {
                    $scope.$apply(function () {
                        handShake(payload.message);
                    });
                }
            });
            // Hardcoding names of initial players
            ctx.playerOne = 'David';
            ctx.playerTwo = 'Daniel';
        }

        function handShake (anotherPlayer) {
            if (ctx.board && ctx.players.length == 1) {
                ctx.players.push(anotherPlayer);
                if(anotherPlayer.style === ctx.players[0].style) {
                    ctx.players[0].style === 'circle' ? 'cross' : 'circle';
                }
                PubNub.ngPublish({
                    channel: 'ticTacHandshake',
                    message: ctx.players[0]
                });
            }
        }

        function movementHandler (cell) {
            // Overriding current board cell, as this might be a message from a galaxy away from this computer
            board.board[cell.x][cell.y] = cell;
            cell.empty = false;
            cell.player = ctx.currentPlayer;
            cell.style = cell.player.style;
            if (!board.gameOver(cell)) {
                ctx.currentPlayer = nextPlayer();
            }

        }

        function nextPlayer() {
            return ctx.currentPlayer === ctx.players[0]
                ? ctx.players[1]
                : ctx.players[0];
        }

        $scope.move = function (cell) {
            movementHandler(cell);
            if(ctx.distributed) {
                PubNub.ngPublish({
                    channel: 'ticTac',
                    message: cell
                });
            }
        }

        $scope.resetGame = function () {
            delete ctx.board;
        }

        $scope.startGame = function () {
            ctx.board = board = new Board();
            board.initBoard();
            if (!ctx.distributed) {
                ctx.players = [
                    new Player({
                        human: true,
                        style: 'circle',
                        name: ctx.playerOne
                    }),
                    new Player({
                        human: true,
                        style: 'cross',
                        name: ctx.playerTwo
                    })
                ];
            } else {
                ctx.players = [
                    new Player({
                        human: true,
                        style: 'circle',
                        name: ctx.playerOne
                    })
                ];
                PubNub.ngPublish({
                    channel: 'ticTacHandshake',
                    message: ctx.players[0]
                });
            }
            ctx.currentPlayer = ctx.players[0];
        }
        init();
    }]);
})();