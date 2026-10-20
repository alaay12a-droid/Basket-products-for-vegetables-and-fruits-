package com.basket.merchant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(MerchantDevicePlugin.class);
        super.onCreate(state);
    }
}
