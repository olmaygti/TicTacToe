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
                if (ctx.players && ctx.localPlayer.name !== payload.message.player.name) {
                    $scope.$apply(function () {
                        movementHandler(payload.message);
                    });
                }
            });
            $rootScope.$on(PubNub.ngMsgEv('ticTacHandshake'), function(event, payload) {
                if (ctx.players && ctx.localPlayer.name !== payload.message.name) {
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
                var localPlayer = ctx.players[0];
                // We must now which player was the first to complete synchronization. That will be the first one playing
                if (anotherPlayer.syncFinished) {
                    //If the other user has finished syncin, he'll be the first playing and he has already
                    // switched symbols
                    ctx.players.unshift(anotherPlayer);
                    ctx.currentPlayer = ctx.players[0];
                } else {
                    // If I'm the first syncing switch symbols and then send an exra syncFinished flag to remote browser
                    ctx.players.push(anotherPlayer);
                    if(anotherPlayer.style === ctx.players[0].style) {
                        ctx.players[0].style = ctx.players[0].style === 'circle' ? 'cross' : 'circle';
                    }
                    PubNub.ngPublish({
                        channel: 'ticTacHandshake',
                        message: _.extend(ctx.players[0], { syncFinished: true})
                    });
                }
            }
        }

        function movementHandler (cell) {
            if (cell.player) {
                // Overriding current board cell, as this message is coming from a galaxy away from this computer
                _.extend(board.board[cell.x][cell.y], cell);
            } else {
                cell.empty = false;
                cell.player = ctx.currentPlayer;
                cell.style = cell.player.style;
            }
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
                ctx.localPlayer = ctx.players[0];
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