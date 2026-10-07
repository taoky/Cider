// The legacy wire protocol is available only through the paired, validated server.
const { RemoteServer } = require("../automation/remote");
export class wsapi extends RemoteServer {
  constructor(win: any, automation: any) {
    super(win, automation);
  }
}
