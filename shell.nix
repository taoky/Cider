{ pkgs ? import <nixpkgs> {} }:

with pkgs; mkShell {
    buildInputs = [
        nodejs-18_x
        python311
        nodePackages.pnpm
    ];
}