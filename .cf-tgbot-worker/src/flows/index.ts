/** Feature module registry. Order only matters for duplicate detection warnings. */

import type { BotModule } from '../dispatch';
import { accountModule } from './account';
import { bindModule } from './bind';
import { helpModule } from './help';
import { homeModule } from './home';
import { settingsModule } from './settings';
import { linksModule } from './links';
import { mailModule } from './mail';

export const modules: BotModule[] = [homeModule, helpModule, bindModule, accountModule, settingsModule, linksModule, mailModule];
