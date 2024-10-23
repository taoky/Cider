{ pkgs ? import <nixpkgs> {} }:

with pkgs; mkShell {
    buildInputs = [
        nodejs_20
        python311
        nodePackages.pnpm
    ];
}